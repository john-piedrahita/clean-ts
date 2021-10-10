import { Module } from './module';
import { Injector } from './injector';
import { Scope, Type} from "../contracts";
import { getClassScope } from '../helpers';
import { CleanContainer } from './container';
import { InstanceLinksHost } from './instance-links-host';
import { IContextId, InstanceWrapper } from './instance-wrapper';
import { InvalidClassScopeException, UnknownElementException } from '../exceptions';

type GetTypes = Type<any> | string | symbol

export abstract class ModuleRef {

  private readonly injector = new Injector();
  private _instanceLinksHost: InstanceLinksHost;

  private get instanceLinksHost() {
    if (!this._instanceLinksHost) {
      this._instanceLinksHost = new InstanceLinksHost(this.container);
    }
    return this._instanceLinksHost;
  }

  protected constructor(
      protected readonly container: CleanContainer
  ) {}

  public abstract get<T = any, R = T>(typeOrToken: GetTypes, options?: { strict: boolean }): R;

  public abstract resolve<T = any, R = T>(typeOrToken: GetTypes, contextId?: IContextId, options?: { strict: boolean }): Promise<T>;

  public abstract create<T = any>(type: Type<T>): Promise<T>;

  protected find<T = any, R = T>(typeOrToken: GetTypes, contextModule?: Module): R {
    const moduleId = contextModule && contextModule.id;
    const { wrapperRef } = this.instanceLinksHost.get<R>(typeOrToken, moduleId);
    if (
      wrapperRef.scope === Scope.REQUEST || wrapperRef.scope === Scope.TRANSIENT
    ) {
      throw new InvalidClassScopeException(typeOrToken);
    }
    return wrapperRef.instance;
  }

  protected async resolvePerContext<T = any, R = T>(
    typeOrToken: GetTypes, contextModule: Module, contextId: IContextId, options?: { strict: boolean }
  ): Promise<R> {
    const isStrictModeEnabled = options && options.strict;
    const instanceLink = isStrictModeEnabled ? this.instanceLinksHost.get(typeOrToken, contextModule.id) : this.instanceLinksHost.get(typeOrToken);
    const { wrapperRef, collection } = instanceLink;

    if (wrapperRef.isDependencyTreeStatic() && !wrapperRef.isTransient) return this.get(typeOrToken);

    const ctorHost = wrapperRef.instance || { constructor: typeOrToken };
    const instance = await this.injector.loadPerContext(ctorHost, wrapperRef.host, collection, contextId, wrapperRef);
    if (!instance) throw new UnknownElementException();

    return instance;
  }

  protected async instantiateClass<T = any>(type: Type<T>, moduleRef: Module): Promise<T> {
    const wrapper = new InstanceWrapper({
      name: type && type.name,
      metaType: type,
      isResolved: false,
      scope: getClassScope(type),
      host: moduleRef,
    });

    return new Promise<T>(async (resolve, reject) => {
      try {
        const callback = async (instances: any[]) => {
          const properties = await this.injector.resolveProperties(wrapper, moduleRef);
          const instance = new type(...instances);
          this.injector.applyProperties(instance, properties);
          resolve(instance);
        };

        await this.injector.resolveConstructorParams<T>(wrapper, moduleRef, undefined, callback);
      } catch (err) {
        reject(err);
      }
    });
  }
}
