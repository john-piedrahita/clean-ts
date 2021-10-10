import { RequestMethod } from '../enums';
import {
  CorsOptions,
  CorsOptionsDelegate,
} from './cors-options.interface';
import { ICleanApplicationOptions } from './clean-application-options.interface';

export type ErrorHandler<T = any, R = any> = (error: any, req: T, res: R, next?: Function) => any;
export type RequestHandler<T = any, R = any> = (req: T, res: R, next?: Function) => any;

export interface IHttpServer<T = any, R = any> {
  use(handler: RequestHandler<T, R> | ErrorHandler<T, R>): any;
  use(path: string, handler: RequestHandler<T, R> | ErrorHandler<T, R>): any;
  get(handler: RequestHandler<T, R>): any;
  get(path: string, handler: RequestHandler<T, R>): any;
  post(handler: RequestHandler<T, R>): any;
  post(path: string, handler: RequestHandler<T, R>): any;
  head(handler: RequestHandler<T, R>): any;
  head(path: string, handler: RequestHandler<T, R>): any;
  delete(handler: RequestHandler<T, R>): any;
  delete(path: string, handler: RequestHandler<T, R>): any;
  put(handler: RequestHandler<T, R>): any;
  put(path: string, handler: RequestHandler<T, R>): any;
  patch(handler: RequestHandler<T, R>): any;
  patch(path: string, handler: RequestHandler<T, R>): any;
  options(handler: RequestHandler<T, R>): any;
  options(path: string, handler: RequestHandler<T, R>): any;
  listen(port: number | string, callback?: () => void): any;
  listen(port: number | string, hostname: string, callback?: () => void): any;
  reply(response: any, body: any, statusCode?: number): any;
  status(response: any, statusCode: number): any;
  render(response: any, view: string, options: any): any;
  redirect(response: any, statusCode: number, url: string): any;
  setHeader(response: any, name: string, value: string): any;
  setErrorHandler?(handler: Function, prefix?: string): any;
  setNotFoundHandler?(handler: Function, prefix?: string): any;
  useStaticAssets?(...args: any[]): this;
  setBaseViewsDir?(path: string | string[]): this;
  setViewEngine?(engineOrOptions: any): this;
  createMiddlewareFactory(method: RequestMethod): ((path: string, callback: Function) => any) | Promise<(path: string, callback: Function) => any>;
  getRequestHostname?(request: T): string;
  getRequestMethod?(request: T): string;
  getRequestUrl?(request: T): string;
  getInstance(): any;
  registerParserMiddleware(): any;
  enableCors(options: CorsOptions | CorsOptionsDelegate<T>): any;
  getHttpServer(): any;
  initHttpServer(options: ICleanApplicationOptions): void;
  close(): any;
  getType(): string;
  init?(): Promise<void>;
}
