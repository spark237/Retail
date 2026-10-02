import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const headerTenantId = request.headers['x-tenant-id'];
    const userTenantId = request.user?.tenantId;

    if (!headerTenantId) {
      return true; // Tenant header optional for some routes
    }

    if (!userTenantId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Tenant context required',
      });
    }

    if (headerTenantId !== userTenantId) {
      throw new ForbiddenException({
        code: 'TENANT_MISMATCH',
        message: 'Tenant ID mismatch between header and token',
      });
    }

    request.tenantId = headerTenantId;
    return true;
  }
}