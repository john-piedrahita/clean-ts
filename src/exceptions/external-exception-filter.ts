import {Logger} from "../services";
import {IArgumentsHost} from "../contracts";
import {HttpException} from "./http.exception";

export class ExternalExceptionFilter<T = any, R = any> {
  private static readonly logger = new Logger('ExceptionsHandler');

  catch(exception: T, host: IArgumentsHost): R | Promise<R> {
    if (exception instanceof Error && !(exception instanceof HttpException)) {
      ExternalExceptionFilter.logger.error(exception.message, exception.stack);
    }
    throw exception;
  }
}
