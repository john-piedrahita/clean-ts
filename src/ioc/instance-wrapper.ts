import { Module } from './module';
import { STATIC_CONTEXT } from './constants';
import { randomStringGenerator, isNil, isUndefined  } from '../utils';
import {IClassProvider, IFactoryProvider, Provider, Scope, Type, IValueProvider} from "../contracts";

export const INSTANCE_ID_SYMBOL = Symbol.for('instance_metadata:id');
export const INSTANCE_METADATA_SYMBOL = Symbol.for('instance_metadata:cache');

export interface IContextId {
  readonly id: number;
}

export interface IInstancePerContext<T> {
  instance: T;
  isResolved?: boolean;
  isPending?: boolean;
  donePromise?: Promise<void>;
}

export interface IPropertyMetadata {
  key: string;
  wrapper: InstanceWrapper;
}

interface IInstanceMetadataStore {
  dependencies?: InstanceWrapper[];
  properties?: IPropertyMetadata[];
  enhancers?: InstanceWrapper[];
}

export class InstanceWrapper<T = any> {

  public readonly name: any;
  public readonly async?: boolean;
  public readonly host?: Module;
  public readonly isAlias: boolean = false;

  public scope?: Scope = Scope.DEFAULT;
  public metaType: Type<T> | Function;
  public inject?: (string | symbol | Function | Type<any>)[];
  public forwardRef?: boolean;

  private readonly values = new WeakMap<IContextId, IInstancePerContext<T>>();
  private readonly [INSTANCE_METADATA_SYMBOL]: IInstanceMetadataStore = {};
  private readonly [INSTANCE_ID_SYMBOL]: string;
  private transientMap?: Map<string, WeakMap<IContextId, IInstancePerContext<T>>>;
  private isTreeStatic: boolean | undefined;

  constructor(
    metadata: Partial<InstanceWrapper<T>> & Partial<IInstancePerContext<T>> = {},
  ) {
    this[INSTANCE_ID_SYMBOL] = randomStringGenerator();
    this.initialize(metadata);
  }

  get id(): string {
    return this[INSTANCE_ID_SYMBOL];
  }

  set instance(value: T) {
    this.values.set(STATIC_CONTEXT, { instance: value });
  }

  get instance(): T {
    const instancePerContext = this.getInstanceByContextId(STATIC_CONTEXT);
    return instancePerContext.instance;
  }

  get isTransient(): boolean {
    return this.scope === Scope.TRANSIENT;
  }

  public getInstanceByContextId(contextId: IContextId, inquirerId?: string): IInstancePerContext<T> {
    if (this.scope === Scope.TRANSIENT && inquirerId) return this.getInstanceByInquirerId(contextId, inquirerId);
    const instancePerContext = this.values.get(contextId);

    return instancePerContext ? instancePerContext : this.cloneStaticInstance(contextId);
  }

  public getInstanceByInquirerId(contextId: IContextId, inquirerId: string): IInstancePerContext<T> {
    let collectionPerContext = this.transientMap.get(inquirerId);
    if (!collectionPerContext) {
      collectionPerContext = new WeakMap();
      this.transientMap.set(inquirerId, collectionPerContext);
    }
    const instancePerContext = collectionPerContext.get(contextId);

    return instancePerContext ? instancePerContext : this.cloneTransientInstance(contextId, inquirerId);
  }

  public setInstanceByContextId(contextId: IContextId, value: IInstancePerContext<T>, inquirerId?: string) {
    if (this.scope === Scope.TRANSIENT && inquirerId) return this.setInstanceByInquirerId(contextId, inquirerId, value);
    this.values.set(contextId, value);
  }

  public setInstanceByInquirerId(contextId: IContextId, inquirerId: string, value: IInstancePerContext<T>) {
    let collection = this.transientMap.get(inquirerId);
    if (!collection) {
      collection = new WeakMap();
      this.transientMap.set(inquirerId, collection);
    }
    collection.set(contextId, value);
  }

  public addCtorMetadata(index: number, wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].dependencies) this[INSTANCE_METADATA_SYMBOL].dependencies = [];
    this[INSTANCE_METADATA_SYMBOL].dependencies[index] = wrapper;
  }

  public getCtorMetadata(): InstanceWrapper[] {
    return this[INSTANCE_METADATA_SYMBOL].dependencies;
  }

  public addPropertiesMetadata(key: string, wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].properties) this[INSTANCE_METADATA_SYMBOL].properties = [];
    this[INSTANCE_METADATA_SYMBOL].properties.push({ key, wrapper});
  }

  public getPropertiesMetadata(): IPropertyMetadata[] {
    return this[INSTANCE_METADATA_SYMBOL].properties;
  }

  public addEnhancerMetadata(wrapper: InstanceWrapper) {
    if (!this[INSTANCE_METADATA_SYMBOL].enhancers) this[INSTANCE_METADATA_SYMBOL].enhancers = [];
    this[INSTANCE_METADATA_SYMBOL].enhancers.push(wrapper);
  }

  public getEnhancersMetadata(): InstanceWrapper[] {
    return this[INSTANCE_METADATA_SYMBOL].enhancers;
  }

  public isDependencyTreeStatic(lookupRegistry: string[] = []): boolean {
    if (!isUndefined(this.isTreeStatic)) return this.isTreeStatic;

    if (this.scope === Scope.REQUEST) {
      this.isTreeStatic = false;
      return this.isTreeStatic;
    }
    if (lookupRegistry.includes(this[INSTANCE_ID_SYMBOL])) return true;
    lookupRegistry = lookupRegistry.concat(this[INSTANCE_ID_SYMBOL]);

    const { dependencies, properties, enhancers } = this[ INSTANCE_METADATA_SYMBOL ];
    let isStatic = (dependencies && this.isWrapperListStatic(dependencies, lookupRegistry)) || !dependencies;

    if (!isStatic || !(properties || enhancers)) {
      this.isTreeStatic = isStatic;
      return this.isTreeStatic;
    }

    const propertiesHosts = (properties || []).map(item => item.wrapper);
    isStatic = isStatic && this.isWrapperListStatic(propertiesHosts, lookupRegistry);
    if (!isStatic || !enhancers) {
      this.isTreeStatic = isStatic;
      return this.isTreeStatic;
    }

    this.isTreeStatic = this.isWrapperListStatic(enhancers, lookupRegistry);
    return this.isTreeStatic;
  }

  public cloneStaticInstance(contextId: IContextId): IInstancePerContext<T> {
    const staticInstance = this.getInstanceByContextId(STATIC_CONTEXT);
    if (this.isDependencyTreeStatic()) return staticInstance;

    const instancePerContext: IInstancePerContext<T> = {
      ...staticInstance,
      instance: undefined,
      isResolved: false,
      isPending: false,
    };
    if (this.isNewable()) instancePerContext.instance = Object.create(this.metaType.prototype);
    this.setInstanceByContextId(contextId, instancePerContext);

    return instancePerContext;
  }

  public cloneTransientInstance(contextId: IContextId, inquirerId: string): IInstancePerContext<T> {
    const staticInstance = this.getInstanceByContextId(STATIC_CONTEXT);
    const instancePerContext: IInstancePerContext<T> = {
      ...staticInstance,
      instance: undefined,
      isResolved: false,
      isPending: false,
    };
    if (this.isNewable()) instancePerContext.instance = Object.create(this.metaType.prototype);

    this.setInstanceByInquirerId(contextId, inquirerId, instancePerContext);
    return instancePerContext;
  }

  public createPrototype(contextId: IContextId) {
    const host = this.getInstanceByContextId(contextId);
    if (!this.isNewable() || host.isResolved) return;
    return Object.create(this.metaType.prototype);
  }

  public isInRequestScope(contextId: IContextId, inquirer?: InstanceWrapper | undefined): boolean {
    const isDependencyTreeStatic = this.isDependencyTreeStatic();
    return (!isDependencyTreeStatic && contextId !== STATIC_CONTEXT && (!this.isTransient || (this.isTransient && !!inquirer)));
  }

  public isLazyTransient(contextId: IContextId, inquirer: InstanceWrapper | undefined): boolean {
    const isInquirerRequestScoped = inquirer && !inquirer.isDependencyTreeStatic();
    return (this.isDependencyTreeStatic() && contextId !== STATIC_CONTEXT && this.isTransient && isInquirerRequestScoped);
  }

  public isExplicitlyRequested(contextId: IContextId, inquirer?: InstanceWrapper): boolean {
    const isSelfRequested = inquirer === this;
    return (this.isDependencyTreeStatic() && contextId !== STATIC_CONTEXT && (isSelfRequested || (inquirer && inquirer.scope === Scope.TRANSIENT)));
  }

  public isStatic(contextId: IContextId, inquirer: InstanceWrapper | undefined): boolean {
    const isInquirerRequestScoped = inquirer && !inquirer.isDependencyTreeStatic();
    const isStaticTransient = this.isTransient && !isInquirerRequestScoped;
    return (this.isDependencyTreeStatic() && contextId === STATIC_CONTEXT && (!this.isTransient || (isStaticTransient && !!inquirer && !inquirer.isTransient)));
  }

  public mergeWith(provider: Provider) {
    if ((provider as IValueProvider).useValue) {
      this.metaType = null;
      this.inject = null;
      this.scope = Scope.DEFAULT;

      this.setInstanceByContextId(STATIC_CONTEXT, {
        instance: (provider as IValueProvider).useValue,
        isResolved: true,
        isPending: false,
      });
    } else if ((provider as IClassProvider).useClass) {
      this.inject = null;
      this.metaType = (provider as IClassProvider).useClass;
    } else if ((provider as IFactoryProvider).useFactory) {
      this.metaType = (provider as IFactoryProvider).useFactory;
      this.inject = (provider as IFactoryProvider).inject || [];
    }
  }

  private isNewable(): boolean {
    return isNil(this.inject) && this.metaType && this.metaType.prototype;
  }

  private isWrapperListStatic(tree: InstanceWrapper[], lookupRegistry: string[]): boolean {
    return tree.every((item: InstanceWrapper) => item.isDependencyTreeStatic(lookupRegistry));
  }

  private initialize(metadata: Partial<InstanceWrapper<T>> & Partial<IInstancePerContext<T>>) {
    const { instance, isResolved, ...wrapperPartial } = metadata;
    Object.assign(this, wrapperPartial);
    this.setInstanceByContextId(STATIC_CONTEXT, { instance, isResolved });
    this.scope === Scope.TRANSIENT && (this.transientMap = new Map());
  }
}
