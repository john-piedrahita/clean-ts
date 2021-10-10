import { Type } from './type.interface';
import { IRouteInfo } from './middleware-configuration.interface';
import { IMiddlewareConsumer } from './middleware-consumer.interface';

export interface IMiddlewareConfigProxy {
  exclude(...routes: (string | IRouteInfo)[]): IMiddlewareConfigProxy;
  forRoutes(...routes: (string | Type<any> | IRouteInfo)[]): IMiddlewareConsumer;
}
