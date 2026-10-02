import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, any>;
  error: null;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        // If the response has already been transformed, return as-is
        if (data && data.success !== undefined) {
          return data;
        }

        const responseBody: ApiResponse<T> = {
          success: true,
          data: data ?? null,
          error: null,
        };

        // If data has meta property, extract it
        if (data && data.meta) {
          responseBody.data = data.data;
          responseBody.meta = data.meta;
        }

        // Add server time
        responseBody.meta = {
          ...(responseBody.meta || {}),
          server_time: new Date().toISOString(),
        };

        return responseBody;
      }),
    );
  }
}