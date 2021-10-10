import {RouteParamTypes} from "../enums";

export interface IRouteParamsFactory {
  exchangeKeyForValue<T extends Record<string, any> = any, R = any, TResult = any>(
    key: RouteParamTypes | string,
    data: any,
    { req, res, next }: { req: T; res: R; next: Function }
  ): TResult;
}
