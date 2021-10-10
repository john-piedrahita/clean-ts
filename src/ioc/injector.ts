import {iterate} from 'iterare';

import {
    IContextId,
    IInstancePerContext,
    InstanceWrapper,
    IPropertyMetadata,
} from './instance-wrapper';
import {
    OPTIONAL_DEPS_METADATA,
    OPTIONAL_PROPERTY_DEPS_METADATA,
    PARAMTYPES_METADATA,
    PROPERTY_DEPS_METADATA, SELF_DECLARED_DEPS_METADATA,
    isFunction, isNil, isObject, isString, isUndefined
} from '../utils';
import {Module} from './module';
import {INQUIRER} from './inquirer';
import {STATIC_CONTEXT} from './constants';
import {
    Controller,
    IInjectorDependencyContext,
    InjectableInterface,
    InjectorDependency,
    IPropertyDependency,
    Type
} from '../contracts';
import {RuntimeException, UndefinedDependencyException, UnknownDependenciesException} from '../exceptions';

export class Injector {

    public loadPrototype<T>({name}: InstanceWrapper<T>, collection: Map<string, InstanceWrapper<T>>, contextId = STATIC_CONTEXT) {
        if (!collection) return;

        const target = collection.get(name);
        const instance = target.createPrototype(contextId);
        if (instance) {
            const wrapper = new InstanceWrapper({...target, instance});
            collection.set(name, wrapper);
        }
    }

    public async loadInstance<T>(
        wrapper: InstanceWrapper<T>, collection: Map<string, InstanceWrapper>, moduleRef: Module,
        contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper,
    ) {
        const inquirerId = this.getInquirerId(inquirer);
        const instanceHost = wrapper.getInstanceByContextId(contextId, inquirerId);

        if (instanceHost.isPending) return instanceHost.donePromise;

        const done = this.applyDoneHook(instanceHost);
        const {name, inject} = wrapper;

        const targetWrapper = collection.get(name);
        if (isUndefined(targetWrapper)) throw new RuntimeException();

        if (instanceHost.isResolved) return done();

        const callback = async (instances: unknown[]) => {
            const properties = await this.resolveProperties(wrapper, moduleRef, inject, contextId, wrapper, inquirer);
            const instance = await this.instantiateClass(instances, wrapper, targetWrapper, contextId, inquirer);
            this.applyProperties(instance, properties);
            done();
        };

        await this.resolveConstructorParams<T>(wrapper, moduleRef, inject, callback, contextId, wrapper, inquirer);
    }

    public async loadMiddleware(
        wrapper: InstanceWrapper, collection: Map<string, InstanceWrapper>, moduleRef: Module,
        contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper,
    ) {
        const {metaType} = wrapper;
        const targetWrapper = collection.get(metaType.name);
        if (!isUndefined(targetWrapper.instance)) return;
        targetWrapper.instance = Object.create(metaType.prototype);
        await this.loadInstance(wrapper, collection, moduleRef, contextId, inquirer || wrapper);
    }

    public async loadController(wrapper: InstanceWrapper<Controller>, moduleRef: Module, contextId = STATIC_CONTEXT) {
        const controllers = moduleRef.controllers;
        await this.loadInstance<Controller>(wrapper, controllers, moduleRef, contextId, wrapper);
        await this.loadEnhancersPerContext(wrapper, contextId, wrapper);
    }

    public async loadInjectable<T = any>(wrapper: InstanceWrapper<T>, moduleRef: Module, contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper,
    ) {
        const injectables = moduleRef.injectables;
        await this.loadInstance<T>(wrapper, injectables, moduleRef, contextId, inquirer);
    }

    public async loadProvider(
        wrapper: InstanceWrapper<InjectableInterface>, moduleRef: Module, contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper
    ) {
        const providers = moduleRef.providers;
        await this.loadInstance<InjectableInterface>(wrapper, providers, moduleRef, contextId, inquirer);
        await this.loadEnhancersPerContext(wrapper, contextId, wrapper);
    }

    public async loadAdapter(
        wrapper: InstanceWrapper<InjectableInterface>, moduleRef: Module, contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper
    ) {
        const adapters = moduleRef.adapters;
        await this.loadInstance<InjectableInterface>(wrapper, adapters, moduleRef, contextId, inquirer);
        await this.loadEnhancersPerContext(wrapper, contextId, wrapper);
    }

    public applyDoneHook<T>(wrapper: IInstancePerContext<T>) {
        let done: () => void;
        wrapper.donePromise = new Promise<void>((resolve, reject) => done = resolve);
        wrapper.isPending = true;
        return done;
    }

    public async resolveConstructorParams<T>(
        wrapper: InstanceWrapper<T>, moduleRef: Module, inject: InjectorDependency[], callback: (args: unknown[]) => void | Promise<void>,
        contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper, parentInquirer?: InstanceWrapper,
    ) {
        const inquirerId = this.getInquirerId(inquirer);
        const metadata = wrapper.getCtorMetadata();
        if (metadata && contextId !== STATIC_CONTEXT) {
            const deps = await this.loadCtorMetadata(metadata, contextId, inquirer, parentInquirer);
            return callback(deps);
        }

        const dependencies = isNil(inject) ? this.reflectConstructorParams(wrapper.metaType as Type<any>) : inject;
        const optionalDependenciesIds = isNil(inject) ? this.reflectOptionalParams(wrapper.metaType as Type<any>) : [];

        let isResolved = true;
        const resolveParam = async (param: unknown, index: number) => {
            try {
                if (this.isInquirer(param, parentInquirer)) {
                    return parentInquirer && parentInquirer.instance;
                }
                const paramWrapper = await this.resolveSingleParam<T>(
                    wrapper, param, {index, dependencies}, moduleRef, contextId, inquirer, index
                );
                const instanceHost = paramWrapper.getInstanceByContextId(contextId, inquirerId);
                if (!instanceHost.isResolved && !paramWrapper.forwardRef) isResolved = false;

                return instanceHost?.instance;
            } catch (err) {
                const isOptional = optionalDependenciesIds.includes(index);
                if (!isOptional) throw err;

                return undefined;
            }
        };
        const instances = await Promise.all(dependencies.map(resolveParam));
        isResolved && (await callback(instances));
    }

    public reflectConstructorParams<T>(type: Type<T>): any[] {
        const paramTypes = Reflect.getMetadata(PARAMTYPES_METADATA, type) || [];
        const selfParams = this.reflectSelfParams<T>(type);
        selfParams.forEach(({index, param}) => (paramTypes[index] = param));
        return paramTypes;
    }

    public reflectOptionalParams<T>(type: Type<T>): any[] {
        return Reflect.getMetadata(OPTIONAL_DEPS_METADATA, type) || [];
    }

    public reflectSelfParams<T>(type: Type<T>): any[] {
        return Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, type) || [];
    }

    public async resolveSingleParam<T>(
        wrapper: InstanceWrapper<T>, param: Type<any> | string | symbol | any, dependencyContext: IInjectorDependencyContext,
        moduleRef: Module, contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper, keyOrIndex?: string | number
    ) {
        if (isUndefined(param)) throw new UndefinedDependencyException(wrapper.name, dependencyContext, moduleRef);

        const token = this.resolveParamToken(wrapper, param);
        return this.resolveComponentInstance<T>(
            moduleRef, isFunction(token) ? (token as Type<any>).name : token, dependencyContext, wrapper, contextId, inquirer, keyOrIndex,
        );
    }

    public resolveParamToken<T>(wrapper: InstanceWrapper<T>, param: Type<any> | string | symbol | any) {
        if (!param.forwardRef) return param;
        wrapper.forwardRef = true;
        return param.forwardRef();
    }

    public async resolveComponentInstance<T>(
        moduleRef: Module, name: any, dependencyContext: IInjectorDependencyContext, wrapper: InstanceWrapper<T>,
        contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper, keyOrIndex?: string | number,
    ): Promise<InstanceWrapper> {
        const providers = moduleRef.providers;
        const adapters = moduleRef.adapters;

        const instanceWrapper = await this.lookupComponent(
            adapters, providers, moduleRef, {...dependencyContext, name}, wrapper, contextId, inquirer, keyOrIndex,
        );

        return this.resolveComponentHost(moduleRef, instanceWrapper, contextId, inquirer);
    }

    public async resolveComponentHost<T>(
        moduleRef: Module, instanceWrapper: InstanceWrapper<T | Promise<T>>, contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper
    ): Promise<InstanceWrapper> {
        const inquirerId = this.getInquirerId(inquirer);
        const instanceHost = instanceWrapper.getInstanceByContextId(contextId, inquirerId);

        if (!instanceHost.isResolved && !instanceWrapper.forwardRef) {
            await this.loadProvider(instanceWrapper, moduleRef, contextId, inquirer);
        } else if (!instanceHost.isResolved && !instanceWrapper.forwardRef) {
            await this.loadAdapter(instanceWrapper, moduleRef, contextId, inquirer)
        } else if (!instanceHost.isResolved && instanceWrapper.forwardRef && (contextId !== STATIC_CONTEXT || !!inquirerId)) {
            instanceHost.donePromise && instanceHost.donePromise.then(() => this.loadProvider(instanceWrapper, moduleRef, contextId, inquirer));
        }

        if (instanceWrapper.async) {
            const host = instanceWrapper.getInstanceByContextId(contextId, inquirerId);
            host.instance = await host.instance;
            instanceWrapper.setInstanceByContextId(contextId, host, inquirerId);
        }

        return instanceWrapper;
    }

    public async lookupComponent<T = any>(
        adapters: Map<string | symbol, InstanceWrapper>, providers: Map<string | symbol, InstanceWrapper>, moduleRef: Module,
        dependencyContext: IInjectorDependencyContext, wrapper: InstanceWrapper<T>, contextId = STATIC_CONTEXT,
        inquirer?: InstanceWrapper, keyOrIndex?: string | number
    ): Promise<InstanceWrapper<T>> {
        const {name} = dependencyContext;

        if (wrapper && wrapper.name === name) throw new UnknownDependenciesException(wrapper.name, dependencyContext, moduleRef);

        if (adapters.has(name)) {
            const instanceWrapper = adapters.get(name);
            this.addDependencyMetadata(keyOrIndex, wrapper, instanceWrapper)
        }

        if (providers.has(name)) {
            const instanceWrapper = providers.get(name);
            this.addDependencyMetadata(keyOrIndex, wrapper, instanceWrapper);
            return instanceWrapper;
        }

        return this.lookupComponentInParentModules(dependencyContext, moduleRef, wrapper, contextId, inquirer, keyOrIndex);
    }

    public async lookupComponentInParentModules<T = any>(
        dependencyContext: IInjectorDependencyContext, moduleRef: Module, wrapper: InstanceWrapper<T>,
        contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper, keyOrIndex?: string | number
    ) {
        const instanceWrapper = await this.lookupComponentInImports(
            moduleRef, dependencyContext.name, wrapper, [], contextId, inquirer, keyOrIndex
        );
        if (isNil(instanceWrapper)) throw new UnknownDependenciesException(wrapper.name, dependencyContext, moduleRef);

        return instanceWrapper;
    }

    public async lookupComponentInImports(
        moduleRef: Module, name: any, wrapper: InstanceWrapper, moduleRegistry: any[] = [], contextId = STATIC_CONTEXT,
        inquirer?: InstanceWrapper, keyOrIndex?: string | number, isTraversing?: boolean,
    ): Promise<any> {
        let instanceWrapperRef: InstanceWrapper = null;
        let instanceWrapperAdapter: InstanceWrapper = null;

        const imports = moduleRef.imports || new Set<Module>();
        const identity = (item: any) => item;

        let children = [...imports.values()].filter(identity);

        if (isTraversing) {
            const contextModuleExports = moduleRef.exports;
            children = children.filter(child => contextModuleExports.has(child.metaType && child.metaType.name));
        }

        for (const relatedModule of children) {
            if (moduleRegistry.includes(relatedModule.id)) continue;
            moduleRegistry.push(relatedModule.id);
            const {providers, exports, adapters} = relatedModule;
            if (!exports.has(name) || !providers.has(name) || !adapters.has(name)) {
                const instanceRef = await this.lookupComponentInImports(
                    relatedModule, name, wrapper, moduleRegistry, contextId, inquirer, keyOrIndex, true
                );
                if (instanceRef) {
                    this.addDependencyMetadata(keyOrIndex, wrapper, instanceRef);
                    return instanceRef;
                }
                continue;
            }

            instanceWrapperRef = providers.get(name);
            this.addDependencyMetadata(keyOrIndex, wrapper, instanceWrapperRef);

            instanceWrapperAdapter = adapters.get(name);
            this.addDependencyMetadata(keyOrIndex, wrapper, instanceWrapperAdapter)

            const inquirerId = this.getInquirerId(inquirer);
            const instanceHost = instanceWrapperRef.getInstanceByContextId(contextId, inquirerId);

            if (!instanceHost.isResolved && !instanceWrapperRef.forwardRef) {
                await this.loadProvider(instanceWrapperRef, relatedModule, contextId, wrapper);
                break;
            }

            const instanceAdapter = instanceWrapperAdapter.getInstanceByContextId(contextId, inquirerId);

            if (!instanceAdapter.isResolved && !instanceWrapperAdapter.getInstanceByContextId(contextId, inquirerId)) {
                await this.loadAdapter(instanceWrapperAdapter, relatedModule, contextId, wrapper);
            }
        }
        return instanceWrapperRef;
    }

    public async resolveProperties<T>(
        wrapper: InstanceWrapper<T>, moduleRef: Module, inject?: InjectorDependency[],
        contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper, parentInquirer?: InstanceWrapper,
    ): Promise<IPropertyDependency[]> {
        if (!isNil(inject)) return [];

        const metadata = wrapper.getPropertiesMetadata();
        if (metadata && contextId !== STATIC_CONTEXT) return this.loadPropertiesMetadata(metadata, contextId, inquirer);

        const properties = this.reflectProperties(wrapper.metaType as Type<any>);
        const instances = await Promise.all(
            properties.map(async (item: IPropertyDependency) => {
                try {
                    const dependencyContext = {key: item.key, name: item.name as string};

                    if (this.isInquirer(item.name, parentInquirer)) return parentInquirer && parentInquirer.instance;

                    const paramWrapper = await this.resolveSingleParam<T>(wrapper, item.name, dependencyContext, moduleRef, contextId, inquirer, item.key);
                    if (!paramWrapper) return undefined;

                    const inquirerId = this.getInquirerId(inquirer);
                    const instanceHost = paramWrapper.getInstanceByContextId(contextId, inquirerId);
                    return instanceHost.instance;
                } catch (err) {
                    if (!item.isOptional) {
                        throw err;
                    }
                    return undefined;
                }
            }),
        );
        return properties.map((item: IPropertyDependency, index: number) => ({...item, instance: instances[index]}));
    }

    public reflectProperties<T>(type: Type<T>): IPropertyDependency[] {
        const properties = Reflect.getMetadata(PROPERTY_DEPS_METADATA, type) || [];
        const optionalKeys: string[] = Reflect.getMetadata(OPTIONAL_PROPERTY_DEPS_METADATA, type) || [];

        return properties.map((item: any) => ({...item, name: item.type, isOptional: optionalKeys.includes(item.key)}));
    }

    public applyProperties<T = any>(instance: T, properties: IPropertyDependency[]): void {
        if (!isObject(instance)) return undefined;

        iterate(properties).filter(item => !isNil(item.instance)).forEach(item => (instance[item.key] = item.instance));
    }

    public async instantiateClass<T = any>(
        instances: any[], wrapper: InstanceWrapper, targetMetaType: InstanceWrapper, contextId = STATIC_CONTEXT, inquirer?: InstanceWrapper
    ): Promise<T> {
        const {metaType, inject} = wrapper;
        const inquirerId = this.getInquirerId(inquirer);
        const instanceHost = targetMetaType.getInstanceByContextId(contextId, inquirerId);
        const isStatic = wrapper.isStatic(contextId, inquirer);
        const isInRequestScope = wrapper.isInRequestScope(contextId, inquirer);
        const isLazyTransient = wrapper.isLazyTransient(contextId, inquirer);
        const isExplicitlyRequested = wrapper.isExplicitlyRequested(contextId, inquirer);
        const isInContext = isStatic || isInRequestScope || isLazyTransient || isExplicitlyRequested;

        if (isNil(inject) && isInContext) {
            instanceHost.instance = wrapper.forwardRef
                ? Object.assign(instanceHost.instance, new (metaType as Type<any>)(...instances)) : new (metaType as Type<any>)(...instances);
        } else if (isInContext) {
            const factoryReturnValue = ((targetMetaType.metaType as any) as Function)(...instances);
            instanceHost.instance = await factoryReturnValue;
        }

        instanceHost.isResolved = true;
        return instanceHost.instance;
    }

    public async loadPerContext<T = any>(
        instance: T, moduleRef: Module, collection: Map<string, InstanceWrapper>, ctx: IContextId, wrapper?: InstanceWrapper
    ): Promise<T> {
        if (!wrapper) {
            const providerCtor = instance.constructor;
            const injectionToken = (providerCtor && providerCtor.name) || ((providerCtor as unknown) as string);
            wrapper = collection.get(injectionToken);
        }

        await this.loadInstance(wrapper, collection, moduleRef, ctx, wrapper);
        await this.loadEnhancersPerContext(wrapper, ctx, wrapper);

        const host = wrapper.getInstanceByContextId(ctx, wrapper.id);
        return host && (host.instance as T);
    }

    public async loadEnhancersPerContext(wrapper: InstanceWrapper, ctx: IContextId, inquirer?: InstanceWrapper) {
        const enhancers = wrapper.getEnhancersMetadata() || [];
        const loadEnhancer = (item: InstanceWrapper) => {
            const hostModule = item.host;
            return this.loadInstance(item, hostModule.injectables, hostModule, ctx, inquirer);
        };
        await Promise.all(enhancers.map(loadEnhancer));
    }

    public async loadCtorMetadata(
        metadata: InstanceWrapper<any>[], contextId: IContextId, inquirer?: InstanceWrapper, parentInquirer?: InstanceWrapper
    ): Promise<any[]> {
        const hosts = await Promise.all(
            metadata.map(async item => this.resolveScopedComponentHost(item, contextId, inquirer, parentInquirer)),
        );
        const inquirerId = this.getInquirerId(inquirer);
        return hosts.map(item => item.getInstanceByContextId(contextId, inquirerId).instance);
    }

    public async loadPropertiesMetadata(metadata: IPropertyMetadata[], contextId: IContextId, inquirer?: InstanceWrapper): Promise<IPropertyDependency[]> {
        const dependenciesHosts = await Promise.all(
            metadata.map(async ({wrapper: item, key}) => ({
                key, host: await this.resolveComponentHost(item.host, item, contextId, inquirer),
            })),
        );
        const inquirerId = this.getInquirerId(inquirer);
        return dependenciesHosts.map(({key, host}) => ({
            key, name: key, instance: host.getInstanceByContextId(contextId, inquirerId).instance,
        }));
    }

    private resolveScopedComponentHost(item: InstanceWrapper, contextId: IContextId, inquirer?: InstanceWrapper, parentInquirer?: InstanceWrapper) {
        return this.isInquirerRequest(item, parentInquirer)
            ? parentInquirer : this.resolveComponentHost(item.host, item, contextId, inquirer);
    }

    protected getInquirerId(inquirer: InstanceWrapper | undefined): string {
        return inquirer && inquirer.id;
    }

    protected isInquirerRequest(item: InstanceWrapper, parentInquirer: InstanceWrapper | undefined) {
        return item.isTransient && item.name === INQUIRER && parentInquirer;
    }

    protected isInquirer(param: unknown, parentInquirer: InstanceWrapper | undefined) {
        return param === INQUIRER && parentInquirer;
    }

    protected addDependencyMetadata(keyOrIndex: number | string, hostWrapper: InstanceWrapper, instanceWrapper: InstanceWrapper) {
        isString(keyOrIndex) ? hostWrapper.addPropertiesMetadata(keyOrIndex, instanceWrapper) : hostWrapper.addCtorMetadata(keyOrIndex, instanceWrapper);
    }
}
