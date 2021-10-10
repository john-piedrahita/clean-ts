import {
  CorsOptions,
  CorsOptionsDelegate,
} from './cors-options.interface';
import { ICleanInterceptor } from './clean-interceptor.interface';
import {IExceptionFilter, IHttpServer, IHandlerTransform, ICleanApplicationContext} from './index';

export interface ICleanApplication extends ICleanApplicationContext {
  use(...args: any[]): this;

  enableCors(options?: CorsOptions | CorsOptionsDelegate<any>): void;

  listen(port: number | string, callback?: () => void): Promise<any>;

  listen(port: number | string, hostname: string, callback?: () => void): Promise<any>;

  getUrl(): Promise<string>;

  listenAsync(port: number | string, hostname?: string): Promise<any>;

  setGlobalPrefix(prefix: string): this;

  getHttpServer(): any;

  getHttpAdapter(): IHttpServer;

  useGlobalFilters(...filters: IExceptionFilter[]): this;

  useGlobalHandlers(...pipes: IHandlerTransform<any>[]): this;

  useGlobalInterceptors(...interceptors: ICleanInterceptor[]): this;

  close(): Promise<void>;
}
