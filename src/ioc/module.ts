import {
    IAbstract,
    IClassProvider,
    Controller, IDynamicModule, IExistingProvider,
    IFactoryProvider,
    InjectableInterface,
    ICleanModule,
    Provider,
    Type, IValueProvider,
} from '../contracts';
import {iterate} from 'iterare';
import {ModuleRef} from './module-ref';
import {ApplicationConfig} from '../app';
import {CleanContainer} from './container';
import {CONTROLLER_ID_KEY} from './constants';
import {InstanceWrapper} from './instance-wrapper';
import {createContextId, getClassScope} from '../helpers';
import {InvalidClassException, RuntimeException, UnknownExportException} from '../exceptions';
import {isFunction, isNil, isString, isSymbol, isUndefined, randomStringGenerator} from '../utils';

type GetProvider = IClassProvider | IFactoryProvider | IValueProvider | IExistingProvider;
type GetTypes = string | symbol | Type<any>

interface IProviderName {
    name?: string | symbol;
}

export class Module {
    private readonly _id: string;
    private readonly _imports = new Set<Module>();
    private readonly _adapters = new Map<any, InstanceWrapper<InjectableInterface>>();
    private readonly _providers = new Map<any, InstanceWrapper<InjectableInterface>>();
    private readonly _injectables = new Map<any, InstanceWrapper<InjectableInterface>>();
    private readonly _middlewares = new Map<any, InstanceWrapper<InjectableInterface>>();
    private readonly _controllers = new Map<string, InstanceWrapper<Controller>>();
    private readonly _exports = new Set<string | symbol>();
    private _distance = 0;

    constructor(
        private readonly _metaType: Type<any>,
        private readonly container: CleanContainer,
    ) {
        this.addCoreProviders();
        this._id = randomStringGenerator();
    }

    get id(): string {
        return this._id;
    }

    get adapters(): Map<any, InstanceWrapper<InjectableInterface>> {
        return this._adapters;
    }

    get providers(): Map<any, InstanceWrapper<InjectableInterface>> {
        return this._providers;
    }

    get middlewares(): Map<any, InstanceWrapper<InjectableInterface>> {
        return this._middlewares;
    }

    get imports(): Set<Module> {
        return this._imports;
    }

    get relatedModules(): Set<Module> {
        return this._imports;
    }

    get routes(): Map<string, InstanceWrapper<Controller>> {
        return this._controllers;
    }

    get injectables(): Map<string, InstanceWrapper<InjectableInterface>> {
        return this._injectables;
    }

    get controllers(): Map<string, InstanceWrapper<Controller>> {
        return this._controllers;
    }

    get exports(): Set<string | symbol> {
        return this._exports;
    }

    get instance(): ICleanModule {
        if (!this._providers.has(this._metaType.name)) throw new RuntimeException();
        const module = this._providers.get(this._metaType.name);
        return module.instance as ICleanModule;
    }

    get metaType(): Type<any> {
        return this._metaType;
    }

    get distance(): number {
        return this._distance;
    }

    set distance(value: number) {
        this._distance = value;
    }

    public addCoreProviders() {
        this.addModuleAsProvider();
        this.addModuleRef();
        this.addApplicationConfig();
        this.addModuleAsAdapter();
    }

    public addModuleRef() {
        const moduleRef = this.createModuleReferenceType();
        this._providers.set(
            ModuleRef.name,
            new InstanceWrapper({
                name: ModuleRef.name,
                metaType: ModuleRef as any,
                isResolved: true,
                instance: new moduleRef(),
                host: this,
            }),
        );
    }

    public addModuleAsProvider() {
        this._providers.set(
            this._metaType.name,
            new InstanceWrapper({
                name: this._metaType.name,
                metaType: this._metaType,
                isResolved: false,
                instance: null,
                host: this,
            }),
        );
    }

    public addApplicationConfig() {
        this._providers.set(
            ApplicationConfig.name,
            new InstanceWrapper({
                name: ApplicationConfig.name,
                isResolved: true,
                instance: this.container.applicationConfig,
                host: this,
            }),
        );
    }

    public addInjectable<T extends InjectableInterface>(injectable: Provider, host?: Type<T>) {

        const {name} = host;

        if (this.isCustomProvider(injectable)) return this.addCustomProvider(injectable, this._injectables);

        let instanceWrapper = this.injectables.get(injectable.name);
        if (!instanceWrapper) {
            instanceWrapper = new InstanceWrapper({
                name: injectable.name,
                metaType: injectable,
                instance: null,
                isResolved: false,
                scope: getClassScope(injectable),
                host: this,
            });
            this._injectables.set(injectable.name, instanceWrapper);
        }
        if (host) {
            const hostWrapper = this._controllers.get(name) || this._providers.get(name);
            hostWrapper && hostWrapper.addEnhancerMetadata(instanceWrapper);
        }
    }

    public addProvider(provider: Provider): string {
        if (this.isCustomProvider(provider)) return this.addCustomProvider(provider, this._providers);

        this._providers.set(
            (provider as Type<InjectableInterface>).name,
            new InstanceWrapper({
                name: (provider as Type<InjectableInterface>).name,
                metaType: provider as Type<InjectableInterface>,
                instance: null,
                isResolved: false,
                scope: getClassScope(provider),
                host: this,
            }),
        );
        return (provider as Type<InjectableInterface>).name;
    }

    public isCustomProvider(provider: Provider): provider is GetProvider {
        return !isNil((provider as IClassProvider | IFactoryProvider | IValueProvider | IExistingProvider).provide);
    }

    public addCustomProvider(
        provider: (IClassProvider | IFactoryProvider | IValueProvider | IExistingProvider) & IProviderName, collection: Map<string, any>
    ): string {
        const name = this.getProviderStaticToken(provider.provide) as string;
        provider = {...provider, name};

        if (this.isCustomClass(provider)) {
            this.addCustomClass(provider, collection);
        } else if (this.isCustomValue(provider)) {
            this.addCustomValue(provider, collection);
        } else if (this.isCustomFactory(provider)) {
            this.addCustomFactory(provider, collection);
        } else if (this.isCustomUseExisting(provider)) {
            this.addCustomUseExisting(provider, collection);
        }
        return name;
    }

    public isCustomClass(provider: any): provider is IClassProvider {
        return !isUndefined((provider as IClassProvider).useClass);
    }

    public isCustomValue(provider: any): provider is IValueProvider {
        return !isUndefined((provider as IValueProvider).useValue);
    }

    public isCustomFactory(provider: any): provider is IFactoryProvider {
        return !isUndefined((provider as IFactoryProvider).useFactory);
    }

    public isCustomUseExisting(provider: any): provider is IExistingProvider {
        return !isUndefined((provider as IExistingProvider).useExisting);
    }

    public isDynamicModule(exported: any): exported is IDynamicModule {
        return exported && exported.module;
    }

    public addCustomClass(provider: IClassProvider & IProviderName, collection: Map<string, InstanceWrapper>) {
        const {name, useClass} = provider;
        let {scope} = provider;
        if (isUndefined(scope)) scope = getClassScope(useClass);

        collection.set(
            name as string,
            new InstanceWrapper({
                name,
                metaType: useClass,
                instance: null,
                isResolved: false,
                scope,
                host: this,
            }),
        );
    }

    public addCustomValue(provider: IValueProvider & IProviderName, collection: Map<string, InstanceWrapper>) {
        const {name, useValue: value} = provider;
        collection.set(
            name as string,
            new InstanceWrapper({
                name,
                metaType: null,
                instance: value,
                isResolved: true,
                async: value instanceof Promise,
                host: this,
            }),
        );
    }

    public addCustomFactory(provider: IFactoryProvider & IProviderName, collection: Map<string, InstanceWrapper>) {
        const {name, useFactory: factory, inject, scope} = provider;
        collection.set(
            name as string,
            new InstanceWrapper({
                name,
                metaType: factory as any,
                instance: null,
                isResolved: false,
                inject: inject || [],
                scope,
                host: this,
            }),
        );
    }

    public addCustomUseExisting(provider: IExistingProvider & IProviderName, collection: Map<string, InstanceWrapper>) {
        const {name, useExisting} = provider;
        collection.set(
            name as string,
            new InstanceWrapper({
                name,
                metaType: (instance => instance) as any,
                instance: null,
                isResolved: false,
                inject: [useExisting],
                host: this,
                isAlias: true,
            }),
        );
    }

    public addExportedProvider(provider: (Provider & IProviderName) | string | symbol | IDynamicModule) {
        const addExportedUnit = (token: string | symbol) => this._exports.add(this.validateExportedProvider(token));

        if (this.isCustomProvider(provider as any)) {
            return this.addCustomExportedProvider(provider as any);
        } else if (isString(provider) || isSymbol(provider)) {
            return addExportedUnit(provider);
        } else if (this.isDynamicModule(provider)) {
            const {module} = provider;
            return addExportedUnit(module.name);
        }
        addExportedUnit(provider.name);
    }

    public addCustomExportedProvider(provider: GetProvider) {
        const provide = provider.provide;
        if (isString(provide) || isSymbol(provide)) return this._exports.add(this.validateExportedProvider(provide));
        this._exports.add(this.validateExportedProvider(provide.name));
    }

    public validateExportedProvider(token: string | symbol) {
        if (this._providers.has(token)) return token;
        const importsArray = [...this._imports.values()];
        const importsNames = iterate(importsArray)
            .filter(item => !!item)
            .map(({metaType}) => metaType)
            .filter(metaType => !!metaType)
            .map(({name}) => name)
            .toArray();

        if (!importsNames.includes(token as string)) {
            const {name} = this.metaType;
            throw new UnknownExportException(name, token);
        }
        return token;
    }

    public addController(controller: Type<Controller>) {
        this._controllers.set(
            controller.name,
            new InstanceWrapper({
                name: controller.name,
                metaType: controller,
                instance: null,
                isResolved: false,
                scope: getClassScope(controller),
                host: this,
            }),
        );

        this.assignControllerUniqueId(controller);
    }

    public assignControllerUniqueId(controller: Type<Controller>) {
        Object.defineProperty(controller, CONTROLLER_ID_KEY, {
            enumerable: false,
            writable: false,
            configurable: true,
            value: randomStringGenerator(),
        });
    }

    public addRelatedModule(module: Module) {
        this._imports.add(module);
    }

    public replace(toReplace: GetTypes, options: any) {
        if (options.isProvider && this.hasProvider(toReplace)) {
            const name = this.getProviderStaticToken(toReplace);
            const originalProvider = this._providers.get(name);

            return originalProvider.mergeWith({provide: toReplace, ...options});

        } else if (options.isAdapter && this.hasAdapter(toReplace)) {
            const name = this.getAdapterStaticToken(toReplace);
            const adapter = this._adapters.get(name);

            return adapter.mergeWith({ provide: toReplace, ...options })

        } else if (!options.isProvider && this.hasInjectable(toReplace)) {
            const name = this.getProviderStaticToken(toReplace);
            const originalInjectable = this._injectables.get(name);

            return originalInjectable.mergeWith({ provide: toReplace, ...options });
        }
    }

    public hasProvider(token: GetTypes): boolean {
        const name = this.getProviderStaticToken(token);
        return this._providers.has(name);
    }

    public hasInjectable(token: GetTypes): boolean {
        const name = this.getProviderStaticToken(token);
        return this._injectables.has(name);
    }

    public getProviderStaticToken(provider: string | symbol | Type<any> | IAbstract<any>): string | symbol {
        return isFunction(provider) ? (provider as Function).name : (provider as string | symbol);
    }

    public getProviderByKey<T = any>(name: string | symbol): InstanceWrapper<T> {
        return this._providers.get(name) as InstanceWrapper<T>;
    }

    public createModuleReferenceType(): Type<ModuleRef> {
        const self = this;
        return class extends ModuleRef {
            constructor() {
                super(self.container);
            }

            public get<T = any, R = T>(typeOrToken: GetTypes, options: { strict: boolean } = {strict: true}): R {
                return !(options && options.strict) ? this.find<T, R>(typeOrToken) : this.find<T, R>(typeOrToken, self);
            }

            public resolve<T = any, R = T>(typeOrToken: GetTypes, contextId = createContextId(), options: { strict: boolean } = {strict: true}): Promise<R> {
                return this.resolvePerContext(typeOrToken, self, contextId, options);
            }

            public async create<T = any>(type: Type<T>): Promise<T> {
                if (!(type && isFunction(type) && type.prototype)) throw new InvalidClassException(type);
                return this.instantiateClass<T>(type, self);
            }
        };
    }


    /**
     * Adapter for add in global Container
     * @param adapter
     */
    public addAdapter(adapter: Provider): string {
        if (this.isCustomAdapter(adapter)) return this.addCustomAdapter(adapter, this._adapters);

        this._adapters.set(
            (adapter as Type<InjectableInterface>).name,
            new InstanceWrapper({
                name: (adapter as Type<InjectableInterface>).name,
                metaType: adapter as Type<InjectableInterface>,
                instance: null,
                isResolved: false,
                scope: getClassScope(adapter),
                host: this,
            }),
        );
        return (adapter as Type<InjectableInterface>).name;
    }

    public isCustomAdapter(adapter: Provider): adapter is GetProvider {
        return !isNil((adapter as IClassProvider | IFactoryProvider | IValueProvider | IExistingProvider).provide);
    }

    public addCustomAdapter(
        adapter: (IClassProvider | IFactoryProvider | IValueProvider | IExistingProvider) & IProviderName, collection: Map<string, any>
    ): string {
        const name = this.getProviderStaticToken(adapter.provide) as string;
        adapter = {...adapter, name};

        if (this.isCustomClass(adapter)) {
            this.addCustomClass(adapter, collection);
        } else if (this.isCustomValue(adapter)) {
            this.addCustomValue(adapter, collection);
        } else if (this.isCustomFactory(adapter)) {
            this.addCustomFactory(adapter, collection);
        } else if (this.isCustomUseExisting(adapter)) {
            this.addCustomUseExisting(adapter, collection);
        }
        return name;
    }

    public hasAdapter(token: GetTypes): boolean {
        const name = this.getAdapterStaticToken(token);
        return this._adapters.has(name)
    }

    public getAdapterStaticToken(adapter: string | symbol | Type<any> | IAbstract<any>): string | symbol {
        return isFunction(adapter) ? (adapter as Function).name : (adapter as string | symbol);
    }

    public getAdapterByKey<T = any>(name: string | symbol): InstanceWrapper<T> {
        return this._adapters.get(name) as InstanceWrapper<T>;
    }

    public addModuleAsAdapter() {
        this._adapters.set(
            this._metaType.name,
            new InstanceWrapper({
                name: this._metaType.name,
                metaType: this._metaType,
                isResolved: false,
                instance: null,
                host: this,
            }),
        );
    }
}
