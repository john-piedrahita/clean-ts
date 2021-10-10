import { RequestMethod } from '../enums';
import { Type } from './type.interface';

export interface IRouteInfo {
  path: string;
  method: RequestMethod;
}

export interface IMiddlewareConfiguration<T = any> {
  middleware: T;
  forRoutes: (Type<any> | string | IRouteInfo)[];
}
