import * as pathToRegexp from 'path-to-regexp';

import {
  addLeadingSlash,
  isString,
  isUndefined,
  METHOD_METADATA, PATH_METADATA
} from '../utils';
import {Logger} from "../services";
import {RequestMethod} from "../enums";
import { ApplicationConfig, MetadataScanner } from '../app';
import { RouteParamsFactory } from './route-params-factory';
import { REQUEST_CONTEXT_ID } from './request/request-constants';
import { RouterExecutionContext } from './router-execution-context';
import { RouterProxy, IRouterProxyCallback } from './router-proxy';
import { HandlersConsumer, HandlersContextCreator } from '../handlers';
import {Controller, IHttpServer, Type, IExceptionsFilter} from "../contracts";
import { InterceptorsConsumer, InterceptorsContextCreator } from '../interceptors';
import { UnknownRequestMappingException, InternalServerErrorException } from '../exceptions';
import { CleanContainer, STATIC_CONTEXT, Injector, InstanceWrapper, IContextId, Module } from '../ioc';
import {ContextIdFactory, ExecutionContextHost, ROUTE_MAPPED_MESSAGE, RouterMethodFactory} from '../helpers';


export interface IRoutePathProperties {
  path: string[];
  requestMethod: RequestMethod;
  targetCallback: IRouterProxyCallback;
  method: string;
}

export class RouterExplorer {
  private readonly executionContextCreator: RouterExecutionContext;
  private readonly routerMethodFactory = new RouterMethodFactory();
  private readonly logger = new Logger("Route available", true);
  private readonly exceptionFiltersCache = new WeakMap();

  constructor(
    private readonly metadataScanner: MetadataScanner,
    private readonly container: CleanContainer,
    private readonly injector?: Injector,
    private readonly routerProxy?: RouterProxy,
    private readonly exceptionsFilter?: IExceptionsFilter,
    config?: ApplicationConfig,
  ) {
    this.executionContextCreator = new RouterExecutionContext(
      new RouteParamsFactory(),
      new HandlersContextCreator(container, config),
      new HandlersConsumer(),
      new InterceptorsContextCreator(container, config),
      new InterceptorsConsumer(),
      container.getHttpAdapterRef(),
    );
  }

  public explore<T extends IHttpServer = any>(
    instanceWrapper: InstanceWrapper, module: string, applicationRef: T, basePath: string, host: string | string[]
  ) {
    const { instance } = instanceWrapper;
    const routerPaths = this.scanForPaths(instance);
    this.applyPathsToRouterProxy(applicationRef, routerPaths, instanceWrapper, module, basePath, host);
  }

  public extractRouterPath(metaType: Type<Controller>, prefix = ''): string[] {
    let path = Reflect.getMetadata(PATH_METADATA, metaType);
    if (isUndefined(path)) throw new UnknownRequestMappingException();

    if (Array.isArray(path))
      path = path.map(p => prefix + addLeadingSlash(p));
    else
      path = [prefix + addLeadingSlash(path)];

    return path.map(p => addLeadingSlash(p));
  }

  public scanForPaths(instance: Controller, prototype?: object): IRoutePathProperties[] {
    const instancePrototype = isUndefined(prototype) ? Object.getPrototypeOf(instance) : prototype;
    return this.metadataScanner.scanFromPrototype<Controller, IRoutePathProperties>(
      instance, instancePrototype, method => this.exploreMethodMetadata(instance, instancePrototype, method),
    );
  }

  public exploreMethodMetadata(instance: Controller, prototype: object, method: string): IRoutePathProperties {
    const instanceCallback = instance[method];
    const prototypeCallback = prototype[method];
    const routePath = Reflect.getMetadata(PATH_METADATA, prototypeCallback);
    if (isUndefined(routePath)) return null;

    const requestMethod: RequestMethod = Reflect.getMetadata(METHOD_METADATA, prototypeCallback);
    const path = isString(routePath) ? [addLeadingSlash(routePath)] : routePath.map(p => addLeadingSlash(p));

    return { path, requestMethod, targetCallback: instanceCallback, method };
  }

  public applyPathsToRouterProxy<T extends IHttpServer>(
    router: T, routePaths: IRoutePathProperties[], instanceWrapper: InstanceWrapper,
    moduleKey: string, basePath: string, host: string | string[],
  ) {
    (routePaths || []).forEach(pathProperties => {
      const { path, requestMethod } = pathProperties;
      this.applyCallbackToRouter(router, pathProperties, instanceWrapper, moduleKey, basePath, host);
      path.forEach(item => {
        const pathStr = this.stripEndSlash(basePath) + this.stripEndSlash(item);
        this.logger.log(ROUTE_MAPPED_MESSAGE(pathStr, requestMethod));
      });
    });
  }

  public stripEndSlash(str: string) {
    return str[str.length - 1] === '/' ? str.slice(0, str.length - 1) : str;
  }

  private applyCallbackToRouter<T extends IHttpServer>(
    router: T, pathProperties: IRoutePathProperties, instanceWrapper: InstanceWrapper,
    moduleKey: string, basePath: string, host: string | string[],
  ) {
    const { path: paths, requestMethod, targetCallback, method } = pathProperties;
    const { instance } = instanceWrapper;
    const routerMethod = this.routerMethodFactory.get(router, requestMethod).bind(router);

    const isRequestScoped = !instanceWrapper.isDependencyTreeStatic();
    const proxy = isRequestScoped
      ? this.createRequestScopedHandler(instanceWrapper, requestMethod, this.container.getModuleByKey(moduleKey), moduleKey, method)
      : this.createCallbackProxy(instance, targetCallback, method, moduleKey, requestMethod);

    const hostHandler = this.applyHostFilter(host, proxy);
    paths.forEach(path => {
      const fullPath = this.stripEndSlash(basePath) + path;
      routerMethod(this.stripEndSlash(fullPath) || '/', hostHandler);
    });
  }

  private applyHostFilter(value: string | string[], handler: Function) {
    if (!value) return handler;

    const httpAdapterRef = this.container.getHttpAdapterRef();
    const hosts = Array.isArray(value) ? value : [value];
    const hostRegExps = hosts.map((host: string) => {
      const keys = [];
      const regexp = pathToRegexp(host, keys);
      return { regexp, keys };
    });

    const unsupportedFilteringErrorMessage = Array.isArray(value)
      ? `HTTP adapter does not support filtering on hosts: ["${value.join(
          '", "',
        )}"]`
      : `HTTP adapter does not support filtering on host: "${value}"`;

    return <T extends Record<string, any> = any, R = any>(req: T, res: R, next: () => void) => {
      (req as Record<string, any>).hosts = {};
      const hostname = httpAdapterRef.getRequestHostname(req) || '';

      for (const exp of hostRegExps) {
        const match = hostname.match(exp.regexp);
        if (match) {
          exp.keys.forEach((key, i) => (req.hosts[key.name] = match[i + 1]));
          return handler(req, res, next);
        }
      }
      if (!next) throw new InternalServerErrorException(unsupportedFilteringErrorMessage);

      return next();
    };
  }

  private createCallbackProxy(
    instance: Controller, callback: IRouterProxyCallback, methodName: string, moduleRef: string,
    requestMethod: RequestMethod, contextId = STATIC_CONTEXT, inquirerId?: string
  ) {
    const executionContext = this.executionContextCreator.create(instance, callback, methodName, moduleRef, requestMethod, contextId, inquirerId);
    const exceptionFilter = this.exceptionsFilter.create(instance, callback, moduleRef, contextId, inquirerId);
    return this.routerProxy.createProxy(executionContext, exceptionFilter);
  }

  public createRequestScopedHandler(
    instanceWrapper: InstanceWrapper, requestMethod: RequestMethod, moduleRef: Module, moduleKey: string, methodName: string
  ) {
    const { instance } = instanceWrapper;
    const collection = moduleRef.controllers;
    return async <T extends Record<any, any>, R>(req: T, res: R, next: () => void) => {
      try {
        const contextId = this.getContextId(req);
        const contextInstance = await this.injector.loadPerContext(instance, moduleRef, collection, contextId);
        this.createCallbackProxy(
            contextInstance, contextInstance[methodName], methodName, moduleKey, requestMethod, contextId, instanceWrapper.id
        )(req, res, next);
      } catch (err) {
        let exceptionFilter = this.exceptionFiltersCache.get(instance[methodName],);
        if (!exceptionFilter) {
          exceptionFilter = this.exceptionsFilter.create(instance, instance[methodName], moduleKey);
          this.exceptionFiltersCache.set(instance[methodName], exceptionFilter);
        }
        const host = new ExecutionContextHost([req, res, next]);
        exceptionFilter.next(err, host);
      }
    };
  }

  private getContextId<T extends Record<any, unknown> = any>(request: T): IContextId {
    const contextId = ContextIdFactory.getByRequest(request);
    if (!request[REQUEST_CONTEXT_ID as any]) {
      Object.defineProperty(request, REQUEST_CONTEXT_ID, {
        value: contextId,
        enumerable: false,
        writable: false,
        configurable: false,
      });
      this.container.registerRequestProvider(request, contextId);
    }
    return contextId;
  }
}
