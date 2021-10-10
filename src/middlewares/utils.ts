

import {v4 as uuid} from 'uuid';
import {iterate} from 'iterare';
import * as pathToRegexp from 'path-to-regexp';

import {isFunction} from '../utils';
import {RequestMethod} from "../enums";
import {IHttpServer, IRouteInfo, Type} from '../contracts';

type RouteInfoRegex = IRouteInfo & { regex: RegExp };

export const filterMiddleware = <T extends Function | Type<any> = any>(middleware: T[], excludedRoutes: IRouteInfo[], httpAdapter: IHttpServer) => {
  const excluded = excludedRoutes.map(route => ({ ...route, regex: pathToRegexp(route.path) }));
  return iterate([])
    .concat(middleware)
    .filter(isFunction)
    .map((item: T) => mapToClass(item, excluded, httpAdapter))
    .toArray();
};

export const mapToClass = <T extends Function | Type<any>>(middleware: T, excludedRoutes: RouteInfoRegex[], httpAdapter: IHttpServer) => {
  if (isMiddlewareClass(middleware)) {
    if (excludedRoutes.length <= 0) return middleware;

    const MiddlewareHost = class extends (middleware) {
      use(...params: unknown[]) {
        const [req, _, next] = params as [Record<string, any>, any, Function];
        const isExcluded = isRouteExcluded(req, excludedRoutes, httpAdapter);
        if (isExcluded) {
          return next();
        }
        return super.use(...params);
      }
    };
    return assignToken(MiddlewareHost, middleware.name);
  }

  return assignToken(
    class {
      use = (...params: unknown[]) => {
        const [req, _, next] = params as [Record<string, any>, any, Function];
        const isExcluded = isRouteExcluded(req, excludedRoutes, httpAdapter);
        if (isExcluded) {
          return next();
        }
        return (middleware as Function)(...params);
      };
    },
  );
};

export function isMiddlewareClass(middleware: any): middleware is Type<any> {
  const middlewareStr = middleware.toString();
  if (middlewareStr.substring(0, 5) === 'class') return true;
  const middlewareArr = middlewareStr.split(' ');
  return (middlewareArr[0] === 'function' && /[A-Z]/.test(middlewareArr[1]?.[0]) && typeof middleware.prototype?.use === 'function');
}

export function assignToken(metaType: Type<any>, token = uuid()): Type<any> {
  Object.defineProperty(metaType, 'name', { value: token });
  return metaType;
}

export function isRouteExcluded(req: Record<string, any>, excludedRoutes: RouteInfoRegex[], httpAdapter: IHttpServer): boolean {
  if (excludedRoutes.length <= 0) return false;

  const reqMethod = httpAdapter.getRequestMethod(req);
  const originalUrl = httpAdapter.getRequestUrl(req);
  const queryParamsIndex = originalUrl && originalUrl.indexOf('?');
  const pathname = queryParamsIndex >= 0 ? originalUrl.slice(0, queryParamsIndex) : originalUrl;

  return excludedRoutes.some(({method, regex}) => {
    if (RequestMethod.ALL === method || RequestMethod[method] === reqMethod) return regex.exec(pathname);
    return false;
  });
}
