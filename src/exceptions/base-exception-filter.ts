import { MESSAGES } from '../app';
import { isObject } from '../utils';
import {HttpStatus} from "../enums";
import {Logger} from "../services";
import { HttpAdapterHost } from '../helpers';
import {HttpException} from "./http.exception";
import {Inject, Optional} from "../decorators";
import { AbstractHttpAdapter } from '../adapters';
import {IArgumentsHost, IExceptionFilter, IHttpServer} from "../contracts";

export class BaseExceptionFilter<T = any> implements IExceptionFilter<T> {

  private static readonly logger = new Logger('ExceptionsHandler');

  @Optional()
  @Inject()
  protected readonly httpAdapterHost?: HttpAdapterHost;

  constructor(
      protected readonly applicationRef?: IHttpServer
  ) {}

  catch(exception: T, host: IArgumentsHost) {
    const applicationRef = this.applicationRef || (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    if (!(exception instanceof HttpException)) return this.handleUnknownError(exception, host, applicationRef);

    const res = exception.getResponse();
    const message = isObject(res) ? res : { statusCode: exception.getStatus(), message: res };
    applicationRef.reply(host.getArgByIndex(1), message, exception.getStatus());
  }

  public handleUnknownError(exception: T, host: IArgumentsHost, applicationRef: AbstractHttpAdapter | IHttpServer) {
    const body = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
    };

    applicationRef.reply(host.getArgByIndex(1), body, body.statusCode);
    if (this.isExceptionObject(exception)) {
      return BaseExceptionFilter.logger.error(exception.message, exception.stack);
    }
    return BaseExceptionFilter.logger.error(exception);
  }

  public isExceptionObject(err: any): err is Error {
    return isObject(err) && !!(err as Error).message;
  }
}
