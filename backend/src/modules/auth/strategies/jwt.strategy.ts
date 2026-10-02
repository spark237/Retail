import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

interface JwtPayload {
  sub: string;
  tenantId: string;
  branchIds: string[];
  roles: string[];
  permissions: string[];
  deviceId: string;
  type: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<any> {
    if (payload.type !== 'access' && payload.type !== 'offline') {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid token type',
      });
    }

    // Verify user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        tenantId: true,
        email: true,
        isActive: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'User not found',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Account is deactivated',
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Account is locked due to too many failed attempts',
      });
    }

    return {
      id: payload.sub,
      sub: payload.sub,
      tenantId: payload.tenantId,
      branchIds: payload.branchIds,
      roles: payload.roles,
      permissions: payload.permissions,
      deviceId: payload.deviceId,
      tokenType: payload.type,
    };
  }
}