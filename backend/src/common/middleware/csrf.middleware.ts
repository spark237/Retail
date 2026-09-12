import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );

    // Since we use Bearer token auth (not cookies), CSRF is mitigated
    // But we still validate content-type for mutation requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        // Allow multipart for file uploads
        if (!contentType.includes('multipart/form-data')) {
          this.logger.warn(`Non-JSON content-type on mutation: ${contentType}`);
        }
      }
    }

    next();
  }
}