import {
  addLeadingSlash,
  isUndefined,
} from '../utils';
import {RequestMethod} from "../enums";
import { ApplicationConfig } from '../app';
import { MiddlewareBuilder } from './builder';
import { RoutesMapper } from './routes-mapper';
import { MiddlewareResolver } from './resolver';
import { MiddlewareContainer } from './container';
import { RouterExceptionFilters, RouterProxy } from '../routers';
import { ContextIdFactory, ExecutionContextHost } from '../helpers';
import { REQUEST_CONTEXT_ID } from '../routers/request/request-constants';
import { InvalidMiddlewareException, RuntimeException } from '../exceptions';
import { STATIC_CONTEXT, CleanContainer, Injector, InstanceWrapper, Module } from '../ioc';
import { IHttpServer, IMiddlewareConfiguration, ICleanModule, IRouteInfo, ICleanMiddleware } from "../contracts";

export class MiddlewareModule {
  private readonly routerProxy = new RouterProxy();
  private readonly exceptionFiltersCache = new WeakMap();

  private injector: Injector;
  private routerExceptionFilter: RouterExceptionFilters;
  private routesMapper: RoutesMapper;
  private resolver: MiddlewareResolver;
  private config: ApplicationConfig;
  private container: CleanContainer;
  private httpAdapter: IHttpServer;

  public async register(
    middlewareContainer: MiddlewareContainer, container: CleanContainer, config: ApplicationConfig, injector: Injector, httpAdapter: IHttpServer,
  ) {
    const appRef = container.getHttpAdapterRef();
    this.routerExceptionFilter = new RouterExceptionFilters(container, config, appRef);
    this.routesMapper = new RoutesMapper(container);
    this.resolver = new MiddlewareResolver(middlewareContainer);

    this.config = config;
    this.injector = injector;
    this.container = container;
    this.httpAdapter = httpAdapter;

    const modules = container.getModules();
    await this.resolveMiddleware(middlewareContainer, modules);
  }

  public async resolveMiddleware(middlewareContainer: MiddlewareContainer, modules: Map<string, Module>) {
    const moduleEntries = [...modules.entries()];
    const loadMiddlewareConfiguration = async ([name, module]: [ string, Module ]) => {
      const instance = module.instance;
      await this.loadConfiguration(middlewareContainer, instance, name);
      await this.resolver.resolveInstances(module, name);
    };
    await Promise.all(moduleEntries.map(loadMiddlewareConfiguration));
  }

  public async loadConfiguration(middlewareContainer: MiddlewareContainer, instance: ICleanModule, moduleKey: string) {
    if (!instance.configure) {
      return;
    }
    const middlewareBuilder = new MiddlewareBuilder(
      this.routesMapper,
      this.httpAdapter,
    );

    await instance.configure(middlewareBuilder);

    if (!(middlewareBuilder instanceof MiddlewareBuilder)) return;

    const config = middlewareBuilder.build();
    middlewareContainer.insertConfig(config, moduleKey);
  }

  public async registerMiddleware(middlewareContainer: MiddlewareContainer, applicationRef: any) {
    const configs = middlewareContainer.getConfigurations();
    const registerAllConfigs = async (moduleKey: string, middlewareConfig: IMiddlewareConfiguration[]) => {
      for (const config of middlewareConfig) {
        await this.registerMiddlewareConfig(middlewareContainer, config, moduleKey, applicationRef);
      }
    };

    const entriesSortedByDistance = [...configs.entries()].sort(
      ([moduleA], [moduleB]) => {
        return (this.container.getModuleByKey(moduleA).distance - this.container.getModuleByKey(moduleB).distance);
      },
    );

    for (const [moduleRef, moduleConfigurations] of entriesSortedByDistance) {
      await registerAllConfigs(moduleRef, [...moduleConfigurations]);
    }
  }

  public async registerMiddlewareConfig(middlewareContainer: MiddlewareContainer, config: IMiddlewareConfiguration, moduleKey: string, applicationRef: any) {
    const { forRoutes } = config;
    for (const routeInfo of forRoutes) {
      await this.registerRouteMiddleware(middlewareContainer, routeInfo as IRouteInfo, config, moduleKey, applicationRef);
    }
  }

  public async registerRouteMiddleware(
      middlewareContainer: MiddlewareContainer, routeInfo: IRouteInfo, config: IMiddlewareConfiguration, moduleKey: string, applicationRef: any
  ) {
    const middlewareCollection = [].concat(config.middleware);
    const moduleRef = this.container.getModuleByKey(moduleKey);

    for (const metaType of middlewareCollection) {
      const collection = middlewareContainer.getMiddlewareCollection(moduleKey);
      const instanceWrapper = collection.get(metaType.name);
      if (isUndefined(instanceWrapper)) throw new RuntimeException();
      if (instanceWrapper.isTransient) return;

      await this.bindHandler(instanceWrapper, applicationRef, routeInfo.method, routeInfo.path, moduleRef, collection);
    }
  }

  private async bindHandler(
    wrapper: InstanceWrapper<ICleanMiddleware>, applicationRef: IHttpServer, method: RequestMethod,
    path: string, moduleRef: Module, collection: Map<string, InstanceWrapper>,
  ) {
    const { instance, metaType } = wrapper;
    if (isUndefined(instance.use)) throw new InvalidMiddlewareException(metaType.name);

    const router = await applicationRef.createMiddlewareFactory(method);
    const isStatic = wrapper.isDependencyTreeStatic();
    if (isStatic) {
      const proxy = await this.createProxy(instance);
      return this.registerHandler(router, path, proxy);
    }
    this.registerHandler(router, path, async <T, R>(req: T, res: R, next: () => void) => {
        try {
          const contextId = ContextIdFactory.getByRequest(req);
          if (!req[REQUEST_CONTEXT_ID]) {
            Object.defineProperty(req, REQUEST_CONTEXT_ID, {
              value: contextId,
              enumerable: false,
              writable: false,
              configurable: false,
            });
            this.container.registerRequestProvider(req, contextId);
          }
          const contextInstance = await this.injector.loadPerContext(instance, moduleRef, collection, contextId);
          const proxy = await this.createProxy<T, R>(contextInstance, contextId);
          return proxy(req, res, next);

        } catch (err) {
          let exceptionsHandler = this.exceptionFiltersCache.get(instance.use);
          if (!exceptionsHandler) {
            exceptionsHandler = this.routerExceptionFilter.create(instance, instance.use, undefined);
            this.exceptionFiltersCache.set(instance.use, exceptionsHandler);
          }
          const host = new ExecutionContextHost([req, res, next]);
          exceptionsHandler.next(err, host);
        }
      },
    );
  }

  private async createProxy<T = unknown, R = unknown>(instance: ICleanMiddleware, contextId = STATIC_CONTEXT): Promise<(req: T, res: R, next: () => void) => void> {
    const exceptionsHandler = this.routerExceptionFilter.create(instance, instance.use, undefined, contextId);
    const middleware = instance.use.bind(instance);
    return this.routerProxy.createProxy(middleware, exceptionsHandler);
  }

  private registerHandler(
      router: (...args: any[]) => void, path: string, proxy: <T, R>(req: T, res: R, next: () => void) => void,
  ) {
    const prefix = this.config.getGlobalPrefix();
    const basePath = addLeadingSlash(prefix);
    if (basePath && path === '/*') path = '*';

    router(basePath + path, proxy);
  }
}
