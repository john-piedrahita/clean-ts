import {ContextUtils} from './context-utils';
import {ExternalErrorProxy} from './external-proxy';
import {HandlerMetadataStorage} from './handler-metadata-storage';
import {ExternalExceptionFilterContext} from '../exceptions';
import {STATIC_CONTEXT, CleanContainer, IContextId, Module, ModulesContainer} from '../ioc';
import {InterceptorsConsumer, InterceptorsContextCreator} from '../interceptors';
import {HandlersConsumer, HandlersContextCreator} from '../handlers';
import {CUSTOM_ROUTE_AGRS_METADATA, isEmpty, isFunction} from '../utils';
import {
  ContextType,
  Controller,
  IHandlerTransform,
  ParamsMetadata,
  IExternalHandlerMetadata,
  IParamPropertiesContext, IParamsFactory, IExternalContextOptions
} from '../contracts';

export class ExternalContextCreator {
  private readonly contextUtils = new ContextUtils();
  private readonly externalErrorProxy = new ExternalErrorProxy();
  private readonly handlerMetadataStorage = new HandlerMetadataStorage<IExternalHandlerMetadata>();
  private container: CleanContainer;

  constructor(
    private readonly interceptorsContextCreator: InterceptorsContextCreator,
    private readonly interceptorsConsumer: InterceptorsConsumer,
    private readonly modulesContainer: ModulesContainer,
    private readonly handlersContextCreator: HandlersContextCreator,
    private readonly handlersConsumer: HandlersConsumer,
    private readonly filtersContextCreator: ExternalExceptionFilterContext,
  ) {}

  static fromContainer(container: CleanContainer): ExternalContextCreator {
    const interceptorsContextCreator = new InterceptorsContextCreator(container, container.applicationConfig);
    const interceptorsConsumer = new InterceptorsConsumer();

    const handlersContextCreator = new HandlersContextCreator(container, container.applicationConfig);
    const handlersConsumer = new HandlersConsumer();

    const filtersContextCreator = new ExternalExceptionFilterContext(container, container.applicationConfig);

    const externalContextCreator = new ExternalContextCreator(
      interceptorsContextCreator, interceptorsConsumer, container.getModules(), handlersContextCreator, handlersConsumer, filtersContextCreator
    );
    externalContextCreator.container = container;
    return externalContextCreator;
  }

  public create<T extends ParamsMetadata = ParamsMetadata, R extends string = ContextType>(
    instance: Controller, callback: (...args: unknown[]) => unknown, methodName: string, metadataKey?: string,
    paramsFactory?: IParamsFactory, contextId = STATIC_CONTEXT, inquirerId?: string,
    options: IExternalContextOptions = {
      interceptors: true,
      filters: true,
    },
    contextType: R = 'http' as R,
  ) {
    const module = this.getContextModuleName(instance.constructor);
    const { argsLength, paramTypes, getParamsMetadata } = this.getMetadata<T, R>(instance, methodName, metadataKey, paramsFactory, contextType);

    const handlers = this.handlersContextCreator.create(instance, callback, module, contextId, inquirerId);
    const exceptionFilter = this.filtersContextCreator.create(instance, callback, module, contextId, inquirerId);
    const interceptors = options.interceptors
      ? this.interceptorsContextCreator.create(instance, callback, module, contextId, inquirerId) : [];

    const paramsMetadata = getParamsMetadata(module, contextId, inquirerId);
    const paramsOptions = paramsMetadata ? this.contextUtils.mergeParamsMetaTypes(paramsMetadata, paramTypes) : [];

    const fnApplyHandlers = this.createPipesFn(handlers, paramsOptions);
    const handler = (initialArgs: unknown[], ...args: unknown[]) => async () => {
      if (fnApplyHandlers) {
        await fnApplyHandlers(initialArgs, ...args);
        return callback.apply(instance, initialArgs);
      }
      return callback.apply(instance, args);
    };

    const target = async (...args: any[]) => {
      const initialArgs = this.contextUtils.createNullArray(argsLength);
      const result = await this.interceptorsConsumer.intercept(interceptors, args, instance, callback, handler(initialArgs, ...args), contextType);
      return this.transformToResult(result);
    };

    return options.filters ? this.externalErrorProxy.createProxy(target, exceptionFilter, contextType) : target;
  }

  public getMetadata<T, C extends string = ContextType>(
    instance: Controller, method: string, metadataKey?: string, paramsFactory?: IParamsFactory, contextType?: C,
  ): IExternalHandlerMetadata {
    const cacheMetadata = this.handlerMetadataStorage.get(instance, method);
    if (cacheMetadata) return cacheMetadata;

    const metadata = this.contextUtils.reflectCallbackMetadata<T>(instance, method, metadataKey || '') || {};
    const keys = Object.keys(metadata);
    const argsLength = this.contextUtils.getArgumentsLength(keys, metadata);
    const paramTypes = this.contextUtils.reflectCallbackParamTypes(instance, method);
    const contextFactory = this.contextUtils.getContextFactory<C>(contextType, instance, instance[method]);
    const getParamsMetadata = (moduleKey: string, contextId = STATIC_CONTEXT, inquirerId?: string) =>
      paramsFactory ? this.exchangeKeysForValues(keys, metadata, moduleKey, paramsFactory, contextId, inquirerId, contextFactory) : null;

    const handlerMetadata: IExternalHandlerMetadata = {
      argsLength,
      paramTypes,
      getParamsMetadata,
    };
    this.handlerMetadataStorage.set(instance, method, handlerMetadata);
    return handlerMetadata;
  }

  public getContextModuleName(constructor: Function): string {
    const defaultModuleName = '';
    const className = constructor.name;
    if (!className) return defaultModuleName;

    for (const [key, module] of [...this.modulesContainer.entries()]) {
      if (this.getProviderByClassName(module, className)) return key;
      if (this.getAdapterByClassName(module, className)) return key;
    }

    return defaultModuleName;
  }

  public getProviderByClassName(module: Module, className: string): boolean {
    const { providers } = module;

    return [...providers.keys()].some(
        provider => provider === className,
    );
  }

  public getAdapterByClassName(module: Module, className: string): boolean {
    const { adapters } = module;

    return [...adapters.keys()].some(adapter => adapter === className);
  }

  public exchangeKeysForValues<T = any>(
    keys: string[], metadata: T, moduleContext: string, paramsFactory: IParamsFactory, contextId = STATIC_CONTEXT,
    inquirerId?: string, contextFactory = this.contextUtils.getContextFactory('http'),
  ): IParamPropertiesContext[] {
    this.handlersContextCreator.setModuleContext(moduleContext);

    return keys.map(key => {
      const { index, data, handlers: handlersCollection } = metadata[key];
      const handlers = this.handlersContextCreator.createConcreteContext(handlersCollection, contextId, inquirerId);
      const type = this.contextUtils.mapParamType(key);

      if (key.includes(CUSTOM_ROUTE_AGRS_METADATA)) {
        const { factory } = metadata[key];
        const customExtractValue = this.contextUtils.getCustomFactory(factory, data, contextFactory);
        return { index, extractValue: customExtractValue, type, data, handlers };
      }

      const numericType = Number(type);
      const extractValue = (...args: unknown[]) => paramsFactory.exchangeKeyForValue(numericType, data, args);

      return { index, extractValue, type: numericType, data, handlers };
    });
  }

  public createPipesFn(handlers: IHandlerTransform[], paramsOptions: (IParamPropertiesContext & { metaType?: unknown })[]) {
    const pipesFn = async (args: unknown[], ...params: unknown[]) => {
      const resolveParamValue = async (
        param: IParamPropertiesContext & { metaType?: unknown },
      ) => {
        const { index, extractValue, type, data, metaType, handlers: paramHandlers } = param;
        const value = extractValue(...params);

        args[index] = await this.getParamValue(value, { metaType, type, data }, handlers.concat(paramHandlers));
      };
      await Promise.all(paramsOptions.map(resolveParamValue));
    };
    return paramsOptions.length ? pipesFn : null;
  }

  public async getParamValue<T>(value: T, { metaType, type, data }: { metaType: any; type: any; data: any }, handlers: IHandlerTransform[]): Promise<any> {
    return isEmpty(handlers) ? value : this.handlersConsumer.apply(value, { metaType, type, data }, handlers);
  }

  public async transformToResult(resultOrDeferred: any) {
    if (resultOrDeferred && isFunction(resultOrDeferred.subscribe)) return resultOrDeferred.toPromise();

    return resultOrDeferred;
  }

  public registerRequestProvider<T = any>(request: T, contextId: IContextId) {
    this.container.registerRequestProvider<T>(request, contextId);
  }
}
