import { Type } from './type.interface';
import { IMiddlewareConfigProxy } from './middleware-config-proxy.interface';

export interface IMiddlewareConsumer {
  apply(...middleware: (Type<any> | Function)[]): IMiddlewareConfigProxy;
}
