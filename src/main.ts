import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    
    // Si es un error 500, oculta los detalles internos (stack trace / SQL)
    const message = status === 500 ? 'Error interno del servidor' : (exception as any).message;

    response.status(status).json({
      statusCode: status,
      message: message,
    });
  }
}