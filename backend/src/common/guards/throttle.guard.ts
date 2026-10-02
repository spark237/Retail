import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ThrottleGuard implements CanActivate {
  private attempts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(
    private configService: ConfigService,
    private readonly limit: number = 5,
    private readonly ttl: number = 60000,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const key = `${ip}:${request.route?.path || 'unknown'}`;

    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record || now > record.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now + this.ttl });
      return true;
    }

    if (record.count >= this.limit) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;
    return true;
  }
}