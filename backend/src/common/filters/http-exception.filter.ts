import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const errorBody = {
      success: false,
      data: null,
      error: {
        code: 'HTTP_ERROR',
        message: exception.message,
        details: null,
      },
    };

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, any>;
      errorBody.error.code = resp.code || this.getDefaultCode(status);
      errorBody.error.message = resp.message || exception.message;
      errorBody.error.details = resp.details || null;
    }

    response.status(status).json(errorBody);
  }

  private getDefaultCode(status: number): string {
    switch (status) {
      case 400: return 'VALIDATION_ERROR';
      case 401: return 'INVALID_CREDENTIALS';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'UNPROCESSABLE_ENTITY';
      case 429: return 'RATE_LIMIT_EXCEEDED';
      case 423: return 'ACCOUNT_LOCKED';
      default: return 'INTERNAL_ERROR';
    }
  }
}