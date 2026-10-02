import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const message = 'An unexpected error occurred';

    this.logger.error(
      `Unhandled exception: ${exception instanceof Error ? exception.message : 'Unknown error'}`,
      exception instanceof Error ? exception.stack : '',
      `${request.method} ${request.url}`,
    );

    response.status(status).json({
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development'
          ? exception instanceof Error ? exception.message : message
          : message,
        details: process.env.NODE_ENV === 'development' && exception instanceof Error
          ? { stack: exception.stack }
          : null,
      },
    });
  }
}