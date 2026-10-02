import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private prisma?: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.route?.path || request.url;
    const user = request.user;
    const now = Date.now();

    // Skip logging for GET requests and auth endpoints
    if (method === 'GET' || url.includes('/auth/')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          const duration = Date.now() - now;
          this.logger.debug(`${method} ${url} - ${duration}ms`);

          // Log to database for mutating operations
          if (this.prisma && user && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            const action = this.buildAction(method, url);
            const resourceType = this.extractResourceType(url);

            this.prisma.auditLog.create({
              data: {
                tenantId: user.tenantId,
                userId: user.sub || user.id,
                action,
                resourceType,
                resourceId: request.params?.id || null,
                details: {
                  method,
                  url,
                  body: this.sanitizeBody(request.body),
                  statusCode: context.switchToHttp().getResponse().statusCode,
                },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'] || null,
                deviceId: request.headers['x-device-id'] || null,
              },
            }).catch((err) => {
              this.logger.error(`Failed to create audit log: ${err.message}`);
            });
          }
        },
        error: (error) => {
          this.logger.error(`${method} ${url} failed: ${error.message}`);
        },
      }),
    );
  }

  private buildAction(method: string, url: string): string {
    const resource = this.extractResourceType(url);
    const actionMap: Record<string, string> = {
      POST: 'created',
      PUT: 'updated',
      PATCH: 'updated',
      DELETE: 'deleted',
    };
    return `${resource}.${actionMap[method] || method.toLowerCase()}`;
  }

  private extractResourceType(url: string): string {
    const parts = url.split('/').filter(Boolean);
    // Remove api/v1 prefix if present
    const cleanParts = parts.filter(p => !p.startsWith('api') && !p.startsWith('v') && !p.match(/^\d+$/));
    return cleanParts[0] || 'unknown';
  }

  private sanitizeBody(body: any): any {
    if (!body) return null;
    const sanitized = { ...body };
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.currentPassword;
    delete sanitized.newPassword;
    delete sanitized.supervisorPassword;
    return sanitized;
  }
}