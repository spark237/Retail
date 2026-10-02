import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  LoginDto,
  RefreshTokenDto,
  LogoutDto,
  DeviceTrustDto,
  DeviceVerifyDto,
  OfflineLoginDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ) {
    this.logger.log(`Login attempt for ${dto.email}`);
    const result = await this.authService.login(
      dto.email,
      dto.password,
      dto.deviceId,
      dto.deviceName,
    );
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken, dto.deviceId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken, dto.deviceId);
  }

  @Public()
  @Post('device/register')
  @HttpCode(HttpStatus.OK)
  async registerDevice(
    @Body() dto: DeviceTrustDto,
    @Req() req: Request,
  ) {
    // User must be authenticated or provide userId
    const userId = (req as any).user?.id || req.body.userId;
    if (!userId) {
      const { UnauthorizedException } = await import('@nestjs/common');
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Authentication required',
      });
    }
    return this.authService.registerDevice(
      userId,
      (req as any).user?.tenantId || req.body.tenantId,
      dto.deviceId,
      dto.deviceName,
      dto.publicKey,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('device/trust')
  @HttpCode(HttpStatus.OK)
  async verifyDevice(
    @Body() dto: DeviceVerifyDto,
  ) {
    return this.authService.verifyDevice(
      dto.userId,
      dto.deviceId,
      dto.signature,
    );
  }

  @Public()
  @Post('offline-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async offlineLogin(@Body() dto: OfflineLoginDto) {
    return this.authService.offlineLogin(dto.email, dto.password, dto.deviceId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}