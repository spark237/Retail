import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly loginAttempts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(email: string, password: string, deviceId?: string, deviceName?: string) {
    // Check rate limiting (in-memory for simplicity; use Redis in production)
    this.checkRateLimit(email);

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        userBranches: true,
      },
    });

    if (!user) {
      this.logger.warn(`Login failed: user not found - ${email}`);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: `Account locked due to too many failed attempts. Try again in ${minutesRemaining} minutes.`,
      });
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Account is deactivated',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.handleFailedLogin(user.id);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // Reset failed login attempts on success
    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          lastLoginIp: null, // Will be set by controller
        },
      });
    }

    // Extract permissions from roles
    const permissions = this.extractPermissions(user);
    const roles = user.userRoles.map((ur) => ur.role.slug);
    const branchIds = user.userBranches.map((ub) => ub.branchId);

    // Generate tokens
    const tokens = await this.generateTokens({
      sub: user.id,
      tenantId: user.tenantId,
      branchIds,
      roles,
      permissions,
      deviceId: deviceId || 'unknown',
    });

    // Store refresh token
    await this.storeRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: tokens.refreshTokenHash,
      deviceId: deviceId || null,
      deviceName: deviceName || null,
      expiresAt: tokens.refreshExpiresAt,
    });

    // Register device trust if device info provided
    if (deviceId) {
      await this.ensureDeviceRegistered(user.id, user.tenantId, deviceId, deviceName);
    }

    this.logger.log(`User ${user.email} logged in successfully`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900, // 15 minutes
      refreshExpiresIn: 604800, // 7 days
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        permissions,
        branches: branchIds,
        tenantId: user.tenantId,
      },
    };
  }

  async refresh(refreshToken: string, deviceId?: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find refresh token in database
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token expired or revoked',
      });
    }

    // Revoke old token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Get user with permissions
    const user = await this.prisma.user.findUnique({
      where: { id: storedToken.userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        userBranches: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'User account is no longer active',
      });
    }

    const permissions = this.extractPermissions(user);
    const roles = user.userRoles.map((ur) => ur.role.slug);
    const branchIds = user.userBranches.map((ub) => ub.branchId);

    // Generate new tokens
    const tokens = await this.generateTokens({
      sub: user.id,
      tenantId: user.tenantId,
      branchIds,
      roles,
      permissions,
      deviceId: deviceId || storedToken.deviceId || 'unknown',
    });

    // Store new refresh token
    await this.storeRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash: tokens.refreshTokenHash,
      deviceId: deviceId || storedToken.deviceId || null,
      deviceName: storedToken.deviceName || null,
      expiresAt: tokens.refreshExpiresAt,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900,
      refreshExpiresIn: 604800,
    };
  }

  async logout(refreshToken: string, deviceId?: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Revoke refresh token
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // If deviceId provided, revoke all tokens for this device
    if (deviceId) {
      await this.prisma.refreshToken.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async registerDevice(userId: string, tenantId: string, deviceId: string, deviceName: string, publicKey: string) {
    // Check if device already registered
    const existing = await this.prisma.deviceTrust.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });

    if (existing) {
      // Update existing device
      await this.prisma.deviceTrust.update({
        where: { id: existing.id },
        data: {
          publicKey,
          deviceName: deviceName || existing.deviceName,
          lastUsedAt: new Date(),
        },
      });

      return {
        deviceId,
        isTrusted: existing.isTrusted,
        trustedAt: existing.trustedAt,
        expiresAt: existing.expiresAt,
      };
    }

    // Create new device trust
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    const deviceTrust = await this.prisma.deviceTrust.create({
      data: {
        userId,
        tenantId,
        deviceId,
        deviceName: deviceName || null,
        publicKey,
        isTrusted: false,
        expiresAt,
      },
    });

    // Generate a challenge for the device to sign
    const challenge = crypto.randomBytes(32).toString('base64');

    return {
      deviceId: deviceTrust.deviceId,
      isTrusted: false,
      trustedAt: null,
      expiresAt: deviceTrust.expiresAt,
      challenge,
    };
  }

  async verifyDevice(userId: string, deviceId: string, signature: string) {
    const deviceTrust = await this.prisma.deviceTrust.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });

    if (!deviceTrust) {
      throw new UnauthorizedException({
        code: 'DEVICE_NOT_TRUSTED',
        message: 'Device not registered. Please register first.',
      });
    }

    // In production, verify the signature using the stored public key
    // For now, we accept any non-empty signature as verified
    // (Actual Ed25519 verification would be done here)
    if (!signature || signature.length < 10) {
      throw new UnauthorizedException({
        code: 'DEVICE_NOT_TRUSTED',
        message: 'Invalid device signature',
      });
    }

    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.deviceTrust.update({
      where: { id: deviceTrust.id },
      data: {
        isTrusted: true,
        trustedAt: now,
        lastUsedAt: now,
        expiresAt,
      },
    });

    // Generate offline token
    const offlineToken = this.jwtService.sign(
      {
        sub: userId,
        tenantId: deviceTrust.tenantId,
        deviceId,
        type: 'offline',
        offlineSessionId: crypto.randomUUID(),
      },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '2h',
      },
    );

    const offlineExpiresAt = new Date();
    offlineExpiresAt.setHours(offlineExpiresAt.getHours() + 2);

    return {
      verified: true,
      offlineToken,
      expiresAt: offlineExpiresAt.toISOString(),
    };
  }

  async offlineLogin(email: string, password: string, deviceId: string) {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        userBranches: true,
        deviceTrusts: {
          where: { deviceId, isTrusted: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // Check if device is trusted
    const isDeviceTrusted = user.deviceTrusts.length > 0;
    if (!isDeviceTrusted) {
      throw new UnauthorizedException({
        code: 'DEVICE_NOT_TRUSTED',
        message: 'Device not trusted for offline authentication. Please connect to the internet first.',
      });
    }

    // Check device trust expiry
    const deviceTrust = user.deviceTrusts[0];
    if (deviceTrust.expiresAt && deviceTrust.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'DEVICE_NOT_TRUSTED',
        message: 'Device trust has expired. Please connect to the internet to re-authenticate.',
      });
    }

    // Update last used
    await this.prisma.deviceTrust.update({
      where: { id: deviceTrust.id },
      data: { lastUsedAt: new Date() },
    });

    const permissions = this.extractPermissions(user);
    const roles = user.userRoles.map((ur) => ur.role.slug);
    const branchIds = user.userBranches.map((ub) => ub.branchId);

    // Generate offline token
    const offlineToken = this.jwtService.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        branchIds,
        roles,
        permissions,
        deviceId,
        type: 'offline',
        offlineSessionId: crypto.randomUUID(),
      },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '2h',
      },
    );

    return {
      accessToken: offlineToken,
      expiresIn: 7200, // 2 hours
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        permissions,
        branches: branchIds,
        tenantId: user.tenantId,
      },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'User not found',
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '12'), 10);
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        requiresPasswordChange: false,
      },
    });

    // Revoke all refresh tokens for this user (force re-login)
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`Password changed for user ${user.email}`);

    return {
      message: 'Password changed successfully',
      requiresRelogin: true,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        userBranches: {
          include: { branch: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    const permissions = this.extractPermissions(user);
    const roles = user.userRoles.map((ur) => ur.role.slug);

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      requiresPasswordChange: user.requiresPasswordChange,
      lastLoginAt: user.lastLoginAt,
      roles,
      permissions,
      branches: user.userBranches.map((ub) => ({
        id: ub.branchId,
        name: ub.branch.name,
        isPrimary: ub.isPrimary,
      })),
      tenantId: user.tenantId,
      createdAt: user.createdAt,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private async generateTokens(payload: {
    sub: string;
    tenantId: string;
    branchIds: string[];
    roles: string[];
    permissions: string[];
    deviceId: string;
  }) {
    const accessToken = this.jwtService.sign(
      {
        sub: payload.sub,
        tenantId: payload.tenantId,
        branchIds: payload.branchIds,
        roles: payload.roles,
        permissions: payload.permissions,
        deviceId: payload.deviceId,
        type: 'access',
      },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const refreshExpiresAt = new Date();
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 7); // 7 days

    return {
      accessToken,
      refreshToken,
      refreshTokenHash,
      refreshExpiresAt,
    };
  }

  private async storeRefreshToken(data: {
    userId: string;
    tenantId: string;
    tokenHash: string;
    deviceId: string | null;
    deviceName: string | null;
    expiresAt: Date;
  }) {
    await this.prisma.refreshToken.create({
      data: {
        userId: data.userId,
        tenantId: data.tenantId,
        tokenHash: data.tokenHash,
        deviceId: data.deviceId,
        deviceName: data.deviceName,
        expiresAt: data.expiresAt,
      },
    });
  }

  private async handleFailedLogin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const newAttempts = user.failedLoginAttempts + 1;
    const maxAttempts = parseInt(this.configService.get<string>('MAX_FAILED_LOGIN_ATTEMPTS', '10'), 10);

    const updateData: any = {
      failedLoginAttempts: newAttempts,
    };

    if (newAttempts >= maxAttempts) {
      const lockoutMinutes = parseInt(
        this.configService.get<string>('ACCOUNT_LOCKOUT_DURATION_MINUTES', '15'),
        10,
      );
      updateData.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      this.logger.warn(`User ${user.email} account locked after ${newAttempts} failed attempts`);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  private async ensureDeviceRegistered(userId: string, tenantId: string, deviceId: string, deviceName?: string) {
    const existing = await this.prisma.deviceTrust.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });

    if (!existing) {
      // Generate a device key pair (in production, the client generates this)
      const { publicKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await this.prisma.deviceTrust.create({
        data: {
          userId,
          tenantId,
          deviceId,
          deviceName: deviceName || null,
          publicKey,
          isTrusted: true,
          trustedAt: new Date(),
          expiresAt,
        },
      });
    }
  }

  private extractPermissions(user: any): string[] {
    const permissions = new Set<string>();
    for (const userRole of user.userRoles || []) {
      for (const rp of userRole.role?.rolePermissions || []) {
        if (rp.permission) {
          permissions.add(`${rp.permission.resource}.${rp.permission.action}`);
        }
      }
    }
    return Array.from(permissions);
  }

  private checkRateLimit(email: string): void {
    const key = `login:${email}`;
    const now = Date.now();
    const record = this.loginAttempts.get(key);

    if (record && now < record.resetAt) {
      if (record.count >= 5) {
        throw new UnauthorizedException({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many login attempts. Please try again later.',
        });
      }
      record.count++;
    } else {
      this.loginAttempts.set(key, { count: 1, resetAt: now + 60000 });
    }
  }
}