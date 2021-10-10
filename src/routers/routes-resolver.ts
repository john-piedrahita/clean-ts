import {RouterProxy} from "./router-proxy";
import {RouterExplorer} from "./router-explorer";
import {HOST_METADATA, MODULE_PATH} from "../utils";
import {ApplicationConfig, MetadataScanner} from "../app";
import {Injector, InstanceWrapper, CleanContainer} from "../ioc";
import {RouterExceptionFilters} from "./router-exception-filters";
import {Controller, IHttpServer, IResolver, Type} from "../contracts";
import {BadRequestException, NotFoundException} from "../exceptions";

export class RoutesResolver implements IResolver {
  private readonly routerProxy = new RouterProxy();
  private readonly routerExceptionsFilter: RouterExceptionFilters;
  private readonly routerExplorer: RouterExplorer;

  constructor(
    private readonly container: CleanContainer,
    private readonly config: ApplicationConfig,
    private readonly injector: Injector,
  ) {
    this.routerExceptionsFilter = new RouterExceptionFilters(container, config, container.getHttpAdapterRef());
    const metadataScanner = new MetadataScanner();
    this.routerExplorer = new RouterExplorer(
      metadataScanner,
      this.container,
      this.injector,
      this.routerProxy,
      this.routerExceptionsFilter,
      this.config,
    );
  }

  public resolve<T extends IHttpServer>(applicationRef: T, basePath: string) {
    const modules = this.container.getModules();

    modules.forEach(({ controllers, metaType }, module) => {
      let path = metaType ? this.getModulePathMetadata(metaType) : undefined;
      path = path ? basePath + path : basePath;

      this.registerRouters(controllers, module, path, applicationRef);
    });
  }

  public registerRouters(routes: Map<string, InstanceWrapper<Controller>>, moduleName: string, basePath: string, applicationRef: IHttpServer) {

    routes.forEach(instanceWrapper => {
      const { metaType } = instanceWrapper;
      const host = this.getHostMetadata(metaType);
      const paths = this.routerExplorer.extractRouterPath(metaType as Type<any>, basePath);
      const controllerName = metaType.name;

      paths.forEach(path => {
        this.routerExplorer.explore(instanceWrapper, moduleName, applicationRef, path, host);
      });
    });
  }

  public registerNotFoundHandler() {
    const applicationRef = this.container.getHttpAdapterRef();
    const callback = <T, R>(req: T, res: R) => {
      const method = applicationRef.getRequestMethod(req);
      const url = applicationRef.getRequestUrl(req);
      throw new NotFoundException(`Cannot ${method} ${url}`);
    };
    const handler = this.routerExceptionsFilter.create({}, callback, undefined);
    const proxy = this.routerProxy.createProxy(callback, handler);
    applicationRef.setNotFoundHandler && applicationRef.setNotFoundHandler(proxy, this.config.getGlobalPrefix());
  }

  public registerExceptionHandler() {
    const callback = <E, T, R>(err: E, req: T, res: R, next: Function) => {
      throw this.mapExternalException(err);
    };

    const handler = this.routerExceptionsFilter.create({}, callback as any, undefined);
    const proxy = this.routerProxy.createExceptionLayerProxy(callback, handler);
    const applicationRef = this.container.getHttpAdapterRef();
    applicationRef.setErrorHandler && applicationRef.setErrorHandler(proxy, this.config.getGlobalPrefix());
  }

  public mapExternalException(err: any) {
    return err instanceof SyntaxError ? new BadRequestException(err.message) : err;
  }

  protected getModulePathMetadata(metaType: Type<unknown>): string | undefined {
    return Reflect.getMetadata(MODULE_PATH, metaType);
  }

  protected getHostMetadata(metaType: Type<unknown> | Function): string | string[] | undefined {
    return Reflect.getMetadata(HOST_METADATA, metaType);
  }
}
