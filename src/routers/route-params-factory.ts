import { RouteParamTypes } from '../enums';
import { IRouteParamsFactory } from '../contracts';

export class RouteParamsFactory implements IRouteParamsFactory {

  public exchangeKeyForValue<T extends Record<string, any> = any, R = any, TResult = any>(
    key: RouteParamTypes | string, data: string | object | any, { req, res, next }: { req: T; res: R; next: Function }): TResult {

    switch (key) {
      case RouteParamTypes.NEXT:
        return next as any;
      case RouteParamTypes.REQUEST:
        return req as any;
      case RouteParamTypes.RESPONSE:
        return res as any;
      case RouteParamTypes.BODY:
        return data && req.body ? req.body[data] : req.body;
      case RouteParamTypes.PARAM:
        return data ? req.params[data] : req.params;
      case RouteParamTypes.QUERY:
        return data ? req.query[data] : req.query;
      case RouteParamTypes.HEADERS:
        return data ? req.headers[data.toLowerCase()] : req.headers;
      default:
        return null;
    }
  }
}
