import {iterate} from "iterare";
import {
  IClassProvider, Controller,
  IDynamicModule, IExceptionFilter, IExistingProvider, IFactoryProvider,
  ForwardReference,
  InjectableInterface,
  IHandlerTransform,
  Provider,
  Scope,
  Type, IValueProvider, ICleanInterceptor,
  IApplicationProviderWrapper
} from "../contracts";
import {InstanceWrapper, Module, ModulesContainer, CleanContainer} from "../ioc";
import {MetadataScanner} from "./metadata-scanner";
import {ApplicationConfig} from "./application-config";
import {
  EXCEPTION_FILTERS_METADATA,
  GUARDS_METADATA,
  INTERCEPTORS_METADATA, isFunction, isNil, isUndefined,
  MODULE_METADATA,
  HANDLERS_METADATA, randomStringGenerator, ROUTE_ARGS_METADATA, flatten
} from "../utils";
import {CircularDependencyException, InvalidModuleException, UndefinedModuleException} from "../exceptions";
import {getClassScope} from "../helpers";
import {APP_FILTER, APP_INTERCEPTOR, APP_HANDLER} from "./constants";

export class DependenciesScanner {

  private readonly applicationProvidersApplyMap: IApplicationProviderWrapper[] = [];

  constructor(
    private readonly container: CleanContainer,
    private readonly metadataScanner: MetadataScanner,
    private readonly applicationConfig = new ApplicationConfig(),
  ) {}

  public async scan(module: Type<any>) {
    await this.registerCoreModule();
    await this.scanForModules(module);
    await this.scanModulesForDependencies();

    this.addScopedEnhancersMetadata();
    this.container.bindGlobalScope();
  }

  public async scanForModules(
    moduleDefinition: ForwardReference | Type<unknown> | IDynamicModule | Promise<IDynamicModule>,
    scope: Type<unknown>[] = [], ctxRegistry: (ForwardReference | IDynamicModule | Type<unknown>)[] = []
  ): Promise<Module> {
    const moduleInstance = await this.insertModule(moduleDefinition, scope);
    moduleDefinition = moduleDefinition instanceof Promise ? await moduleDefinition : moduleDefinition;

    ctxRegistry.push(moduleDefinition);

    if (this.isForwardReference(moduleDefinition)) moduleDefinition = moduleDefinition.forwardRef();

    const modules = !this.isDynamicModule(moduleDefinition as Type<any> | IDynamicModule)
      ? this.reflectMetadata(moduleDefinition as Type<any>, MODULE_METADATA.IMPORTS)
      : [
          ...this.reflectMetadata((moduleDefinition as IDynamicModule).module, MODULE_METADATA.IMPORTS),
          ...((moduleDefinition as IDynamicModule).imports || []),
        ];

    for (const [index, innerModule] of modules.entries()) {
      if (innerModule === undefined) throw new UndefinedModuleException(moduleDefinition, index, scope);
      if (!innerModule) throw new InvalidModuleException(moduleDefinition, index, scope);
      if (ctxRegistry.includes(innerModule)) continue;

      await this.scanForModules(innerModule, [].concat(scope, moduleDefinition), ctxRegistry);
    }
    return moduleInstance;
  }

  public async insertModule(module: any, scope: Type<unknown>[]): Promise<Module> {
    if (module && module.forwardRef) return this.container.addModule(module.forwardRef(), scope);
    return this.container.addModule(module, scope);
  }

  public async scanModulesForDependencies() {
    const modules = this.container.getModules();

    for (const [token, { metaType }] of modules) {
      await this.reflectImports(metaType, token, metaType.name);
      this.reflectAdapters(metaType, token)
      this.reflectProviders(metaType, token);
      this.reflectControllers(metaType, token);
      this.reflectExports(metaType, token);
    }
   await this.calculateModulesDistance(modules);
  }

  public async reflectImports(module: Type<unknown>, token: string, context: string) {
    const modules = [
      ...this.reflectMetadata(module, MODULE_METADATA.IMPORTS),
      ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.IMPORTS as 'imports')
    ];
    for (const related of modules) {
      await this.insertImport(related, token, context);
    }
  }

  public reflectProviders(module: Type<any>, token: string) {
    const providers = [
      ...this.reflectMetadata(module, MODULE_METADATA.PROVIDERS),
      ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.PROVIDERS as 'providers')
    ];

    providers.forEach(provider => {
      this.insertProvider(provider, token);
      this.reflectDynamicMetadata(provider, token);
    });
  }

  public reflectAdapters(module: Type<any>, token: string) {
    const adapters = [
      ...this.reflectMetadata(module, MODULE_METADATA.ADAPTERS),
      ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.ADAPTERS as 'adapters')
    ];

    adapters.forEach(adapter => {
      this.insertAdapter(adapter, token);
      this.reflectDynamicMetadata(adapter, token);
    });
  }

  public reflectControllers(module: Type<any>, token: string) {
    const controllers = [
      ...this.reflectMetadata(module, MODULE_METADATA.CONTROLLERS),
      ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.CONTROLLERS as 'controllers')
    ];
    controllers.forEach(item => {
      this.insertController(item, token);
      this.reflectDynamicMetadata(item, token);
    });
  }

  public reflectDynamicMetadata(obj: Type<InjectableInterface>, token: string) {
    if (!obj || !obj.prototype) {
      return;
    }
    this.reflectInjectables(obj, token, GUARDS_METADATA);
    this.reflectInjectables(obj, token, INTERCEPTORS_METADATA);
    this.reflectInjectables(obj, token, EXCEPTION_FILTERS_METADATA);
    this.reflectInjectables(obj, token, HANDLERS_METADATA);
    this.reflectParamInjectables(obj, token, ROUTE_ARGS_METADATA);
  }

  public reflectExports(module: Type<unknown>, token: string) {
    const exports = [
      ...this.reflectMetadata(module, MODULE_METADATA.EXPORTS),
      ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.EXPORTS as 'exports')
    ];
    exports.forEach(exportedProvider =>
      this.insertExportedProvider(exportedProvider, token),
    );
  }

  public reflectInjectables(component: Type<InjectableInterface>, token: string, metadataKey: string) {
    const controllerInjectables = this.reflectMetadata(component, metadataKey);
    const methodsInjectables = this.metadataScanner.scanFromPrototype(
      null,
      component.prototype,
      this.reflectKeyMetadata.bind(this, component, metadataKey),
    );

    const flattenMethodsInjectables = this.flatten(methodsInjectables);
    const combinedInjectables = [
      ...controllerInjectables,
      ...flattenMethodsInjectables,
    ].filter(isFunction);
    const injectables = Array.from(new Set(combinedInjectables));

    injectables.forEach(injectable => this.insertInjectable(injectable, token, component));
  }

  public reflectParamInjectables(component: Type<InjectableInterface>, token: string, metadataKey: string) {
    const paramsMetadata = this.metadataScanner.scanFromPrototype(
        null, component.prototype, method => Reflect.getMetadata(metadataKey, component, method)
    );

    const paramsInjectables = this.flatten(paramsMetadata).map((param: Record<string, any>) =>
      flatten(Object.keys(param).map(k => param[k].pipes)).filter(isFunction),
    );

    flatten(paramsInjectables).forEach((injectable: Type<InjectableInterface>) => this.insertInjectable(injectable, token, component));
  }

  public reflectKeyMetadata(component: Type<InjectableInterface>, key: string, method: string) {
    let prototype = component.prototype;
    prototype = Reflect.getPrototypeOf(prototype);

    do {
      const descriptor = Reflect.getOwnPropertyDescriptor(prototype, method);
      if (!descriptor) {
        continue;
      }
      return Reflect.getMetadata(key, descriptor.value);
    } while (prototype  && prototype !== Object.prototype && prototype);

    return undefined;
  }

  public async calculateModulesDistance(modules: ModulesContainer) {
    const modulesGenerator = modules.values();
    const rootModule = modulesGenerator.next().value as Module;
    const modulesStack = [rootModule];

    const calculateDistance = (moduleRef: Module, distance = 1) => {
      if (modulesStack.includes(moduleRef)) return;
      modulesStack.push(moduleRef);

      const moduleImports = rootModule.relatedModules;
      moduleImports.forEach(module => {
        module.distance = distance;
        calculateDistance(module, distance + 1);
      });
    };
    calculateDistance(rootModule);
  }

  public async insertImport(related: any, token: string, context: string) {
    if (isUndefined(related)) throw new CircularDependencyException(context);
    if (related && related.forwardRef) return this.container.addImport(related.forwardRef(), token);
    await this.container.addImport(related, token);
  }

  public isCustomProvider( provider: Provider): provider is IClassProvider | IValueProvider | IFactoryProvider | IExistingProvider {
    return provider && !isNil((provider as any).provide);
  }

  public insertProvider(provider: Provider, token: string) {
    const isCustomProvider = this.isCustomProvider(provider);
    if (!isCustomProvider) return this.container.addProvider(provider as Type<any>, token);

    const applyProvidersMap = this.getApplyProvidersMap();
    const providersKeys = Object.keys(applyProvidersMap);
    const type = (provider as IClassProvider | IValueProvider | IFactoryProvider | IExistingProvider).provide;

    if (!providersKeys.includes(type as string)) return this.container.addProvider(provider as any, token);

    const providerToken = `${ type as string } (UUID: ${randomStringGenerator()})`;

    let scope = (provider as IClassProvider | IFactoryProvider).scope;
    if (isNil(scope) && (provider as IClassProvider).useClass) {
      scope = getClassScope((provider as IClassProvider).useClass);
    }
    this.applicationProvidersApplyMap.push({
      type,
      moduleKey: token,
      providerKey: providerToken,
      scope,
    });

    const newProvider = {
      ...provider,
      provide: providerToken,
      scope,
    } as Provider;

    if (this.isRequestOrTransient((newProvider as IFactoryProvider | IClassProvider).scope)) return this.container.addInjectable(newProvider, token);

    this.container.addProvider(newProvider, token);
  }

  public insertAdapter(adapter: Provider, token: string) {

    const isCustomProvider = this.isCustomProvider(adapter);

    if (!isCustomProvider) return this.container.addAdapter(adapter as Type<any>, token);

    const applyProvidersMap = this.getApplyProvidersMap();

    const providersKeys = Object.keys(applyProvidersMap);
    const type = (adapter as IClassProvider | IValueProvider | IFactoryProvider | IExistingProvider).provide;

    if (!providersKeys.includes(type as string)) return this.container.addAdapter(adapter as any, token);

    const providerToken = `${ type as string } (UUID: ${randomStringGenerator()})`;

    let scope = (adapter as IClassProvider | IFactoryProvider).scope;
    if (isNil(scope) && (adapter as IClassProvider).useClass) {
      scope = getClassScope((adapter as IClassProvider).useClass);
    }
    this.applicationProvidersApplyMap.push({
      type,
      moduleKey: token,
      providerKey: providerToken,
      scope,
    });

    const newProvider = {
      ...adapter,
      provide: providerToken,
      scope,
    } as Provider;

    if (this.isRequestOrTransient((newProvider as IFactoryProvider | IClassProvider).scope)) return this.container.addInjectable(newProvider, token);

    this.container.addAdapter(newProvider, token);
  }

  public insertInjectable(injectable: Type<InjectableInterface>, token: string, host: Type<InjectableInterface>) {
    this.container.addInjectable(injectable, token, host);
  }

  public insertExportedProvider(exportedProvider: Type<InjectableInterface>, token: string) {
    this.container.addExportedProvider(exportedProvider, token);
  }

  public insertController(controller: Type<Controller>, token: string) {
    this.container.addController(controller, token);
  }

  public reflectMetadata(metaType: Type<any>, metadataKey: string) {
    return Reflect.getMetadata(metadataKey, metaType) || [];
  }

  public async registerCoreModule() {
    const module = this.container.createCoreModule();
    const instance = await this.scanForModules(module);
    this.container.registerCoreModuleRef(instance);
  }

  public addScopedEnhancersMetadata() {
    iterate(this.applicationProvidersApplyMap)
      .filter(wrapper => this.isRequestOrTransient(wrapper.scope))
      .forEach(({ moduleKey, providerKey }) => {
        const modulesContainer = this.container.getModules();
        const { injectables } = modulesContainer.get(moduleKey);
        const instanceWrapper = injectables.get(providerKey);

        iterate(modulesContainer.values())
          .map(module => module.controllers.values())
          .flatten()
          .forEach(controller =>
            controller.addEnhancerMetadata(instanceWrapper),
          );
      });
  }

  public applyApplicationProviders() {
    const applyProvidersMap = this.getApplyProvidersMap();
    const applyRequestProvidersMap = this.getApplyRequestProvidersMap();

    const getInstanceWrapper = (moduleKey: string, providerKey: string, collectionKey: 'providers' | 'injectables' | 'adapters') => {
      const modules = this.container.getModules();
      const collection = modules.get(moduleKey)[collectionKey];
      return collection.get(providerKey);
    };

    this.applicationProvidersApplyMap.forEach(
      ({ moduleKey, providerKey, type, scope }) => {
        let instanceWrapper: InstanceWrapper;
        if (this.isRequestOrTransient(scope)) {
          instanceWrapper = getInstanceWrapper(moduleKey, providerKey, 'injectables');
          return applyRequestProvidersMap[type as string](instanceWrapper);
        }

        instanceWrapper = getInstanceWrapper(moduleKey, providerKey, 'adapters');
        applyProvidersMap[type as string](instanceWrapper.instance);

        instanceWrapper = getInstanceWrapper(moduleKey, providerKey, 'providers');
        applyProvidersMap[type as string](instanceWrapper.instance);
      },
    );
  }

  public getApplyProvidersMap(): { [type: string]: Function } {
    return {
      [APP_INTERCEPTOR]: (interceptor: ICleanInterceptor) =>
        this.applicationConfig.addGlobalInterceptor(interceptor),
      [APP_HANDLER]: (handler: IHandlerTransform) =>
        this.applicationConfig.addGlobalHandler(handler),
      [APP_FILTER]: (filter: IExceptionFilter) =>
        this.applicationConfig.addGlobalFilter(filter),
    };
  }

  public getApplyRequestProvidersMap(): { [type: string]: Function } {
    return {
      [APP_INTERCEPTOR]: (interceptor: InstanceWrapper<ICleanInterceptor>) =>
        this.applicationConfig.addGlobalRequestInterceptor(interceptor),
      [APP_HANDLER]: (handler: InstanceWrapper<IHandlerTransform>) =>
        this.applicationConfig.addGlobalRequestHandler(handler),
      [APP_FILTER]: (filter: InstanceWrapper<IExceptionFilter>) =>
        this.applicationConfig.addGlobalRequestFilter(filter),
    };
  }

  public isDynamicModule(module: Type<any> | IDynamicModule): module is IDynamicModule {
    return module && !!(module as IDynamicModule).module;
  }

  public isForwardReference(module: Type<any> | IDynamicModule | ForwardReference): module is ForwardReference {
    return module && !!(module as ForwardReference).forwardRef;
  }

  protected flatten<T = any>(arr: T[][]): T[] {
    return arr.reduce((a: T[], b: T[]) => a.concat(b), []);
  }

  protected isRequestOrTransient(scope: Scope): boolean {
    return scope === Scope.REQUEST || scope === Scope.TRANSIENT;
  }
}
