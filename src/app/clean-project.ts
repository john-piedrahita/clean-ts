import {Logger} from "../services";
import {
  IHttpServer,
  ICleanApplication,
  ICleanApplicationContextOptions,
  ICleanApplicationOptions
} from "../contracts";
import {AbstractHttpAdapter} from "../adapters";
import {ApplicationConfig} from "./application-config";
import {InstanceLoader, CleanContainer} from "../ioc";
import {CleanApplication} from "./clean-application";
import {MetadataScanner} from "./metadata-scanner";
import {DependenciesScanner} from "./scanner";
import {loadAdapter, rethrow} from "../helpers";
import {MESSAGES} from "./constants";
import {isFunction, isNil} from "../utils";
import {ExceptionsZone} from "../exceptions";

export class CleanProjectStatic {

  private readonly logger = new Logger('Start project server', true);
  private abortOnError = true;

  public async create<T extends ICleanApplication = ICleanApplication>(module: any, options?: ICleanApplicationOptions): Promise<T>;

  public async create<T extends ICleanApplication = ICleanApplication>(module: any, httpAdapter: AbstractHttpAdapter, options?: ICleanApplicationOptions): Promise<T>;

  public async create<T extends ICleanApplication = ICleanApplication>(
    module: any, serverOrOptions?: AbstractHttpAdapter | ICleanApplicationOptions, options?: ICleanApplicationOptions,
  ): Promise<T> {

    const [httpServer, appOptions] = this.isHttpServer(serverOrOptions) ? [serverOrOptions, options] : [this.createHttpAdapter(), serverOrOptions];

    const applicationConfig = new ApplicationConfig();
    const container = new CleanContainer(applicationConfig);
    this.setAbortOnError(serverOrOptions, options);
    this.applyLogger(appOptions);
    await this.initialize(module, container, applicationConfig, httpServer);

    const instance = new CleanApplication(container, httpServer, applicationConfig, appOptions);
    const target = this.createNestInstance(instance);

    return this.createAdapterProxy<T>(target, httpServer);
  }

  private createNestInstance<T>(instance: T): T {
    return this.createProxy(instance);
  }

  private async initialize(module: any, container: CleanContainer, config = new ApplicationConfig(), httpServer: IHttpServer = null) {
    const instanceLoader = new InstanceLoader(container);
    const metadataScanner = new MetadataScanner();
    const dependenciesScanner = new DependenciesScanner(container, metadataScanner, config);
    container.setHttpAdapter(httpServer);

    const teardown = this.abortOnError === false ? rethrow : undefined;
    await httpServer?.init();
    try {
      this.logger.log(MESSAGES.APPLICATION_START);

      await ExceptionsZone.asyncRun(async () => {
        await dependenciesScanner.scan(module);
        await instanceLoader.createInstancesOfDependencies();
        dependenciesScanner.applyApplicationProviders();
      }, teardown);
    } catch (e) {
      this.handleInitializationError(e);
    }
  }

  private handleInitializationError(err: unknown) {
    if (this.abortOnError) process.abort();
    rethrow(err);
  }

  private createProxy(target: any) {
    const proxy = this.createExceptionProxy();
    return new Proxy(target, {
      get: proxy,
      set: proxy,
    });
  }

  private createExceptionProxy() {
    return (receiver: Record<string, any>, prop: string) => {
      if (!(prop in receiver)) return;
      if (isFunction(receiver[prop])) return this.createExceptionZone(receiver, prop);

      return receiver[prop];
    };
  }

  private createExceptionZone(receiver: Record<string, any>, prop: string): Function {
    const teardown = this.abortOnError === false ? rethrow : undefined;

    return (...args: unknown[]) => {
      let result: unknown;
      ExceptionsZone.run(() => {
        result = receiver[prop](...args);
      }, teardown);

      return result;
    };
  }

  protected applyLogger(options: ICleanApplicationContextOptions | undefined) {
    if (!options || options?.logger === true || isNil(options?.logger)) return;

    Logger.overrideLogger(options.logger);
  }

  private createHttpAdapter<T = any>(httpServer?: T): AbstractHttpAdapter {
    const { ExpressAdapter } = loadAdapter(
      'express',
      'HTTP',
      () => require('../server/adapters/express-adapter'),
    );
    return new ExpressAdapter(httpServer);
  }

  protected isHttpServer(serverOrOptions: AbstractHttpAdapter | ICleanApplicationOptions): serverOrOptions is AbstractHttpAdapter {
    return !!(serverOrOptions && (serverOrOptions as AbstractHttpAdapter).patch);
  }

  private setAbortOnError(serverOrOptions?: AbstractHttpAdapter | ICleanApplicationOptions, options?: ICleanApplicationContextOptions | ICleanApplicationOptions) {
    this.abortOnError = this.isHttpServer(serverOrOptions)
      ? !(options && options.abortOnError === false) : !(serverOrOptions && serverOrOptions.abortOnError === false);
  }

  private createAdapterProxy<T>(app: CleanApplication, adapter: IHttpServer): T {
     const proxy = new Proxy(app, {
      get: (receiver: Record<string, any>, prop: string) => {
        const mapToProxy = (result: unknown) => {
          if (result instanceof Promise) return result.then(mapToProxy)
          return result instanceof CleanApplication ? proxy : result;
        };

        if (!(prop in receiver) && prop in adapter) {
          return (...args: unknown[]) => {
            const result = this.createExceptionZone(adapter, prop)(...args);
            return mapToProxy(result);
          };
        }
        if (isFunction(receiver[prop])) {
          return (...args: unknown[]) => {
            const result = receiver[prop](...args);
            return mapToProxy(result);
          };
        }
        return receiver[prop];
      },
    });
    return (proxy as unknown) as T;
  }
}

export const StartProjectServer = new CleanProjectStatic();
