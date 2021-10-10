import { iterate } from 'iterare';
import { ApplicationConfig } from '../app';
import { ContextCreator } from '../helpers';
import { Controller, ICleanInterceptor } from '../contracts';
import { INTERCEPTORS_METADATA, isEmpty, isFunction } from '../utils';
import { STATIC_CONTEXT, CleanContainer, InstanceWrapper } from '../ioc';

export class InterceptorsContextCreator extends ContextCreator {
  private moduleContext: string;

  constructor(
    private readonly container: CleanContainer,
    private readonly config?: ApplicationConfig,
  ) {
    super();
  }

  public create(
    instance: Controller, callback: (...args: unknown[]) => unknown, module: string,
    contextId = STATIC_CONTEXT, inquirerId?: string
  ): ICleanInterceptor[] {
    this.moduleContext = module;
    return this.createContext(instance, callback, INTERCEPTORS_METADATA, contextId, inquirerId);
  }

  public createConcreteContext<T extends any[], R extends any[]>(metadata: T, contextId = STATIC_CONTEXT, inquirerId?: string): R {
    if (isEmpty(metadata)) return [] as R;

    return iterate(metadata)
      .filter(
        interceptor => interceptor && (interceptor.name || interceptor.intercept),
      )
      .map(interceptor => this.getInterceptorInstance(interceptor, contextId, inquirerId))
      .filter((interceptor: ICleanInterceptor) => interceptor && isFunction(interceptor.intercept))
      .toArray() as R;
  }

  public getInterceptorInstance(interceptor: Function | ICleanInterceptor, contextId = STATIC_CONTEXT, inquirerId?: string): ICleanInterceptor | null {
    const isObject = (interceptor as ICleanInterceptor).intercept;
    if (isObject) return interceptor as ICleanInterceptor;

    const instanceWrapper = this.getInstanceByMetaType(interceptor);

    if (!instanceWrapper) return null;
    const instanceHost = instanceWrapper.getInstanceByContextId(contextId, inquirerId);

    return instanceHost && instanceHost.instance;
  }

  public getInstanceByMetaType<T extends Record<string, any> = any>(metaType: T): InstanceWrapper | undefined {
    if (!this.moduleContext) return;

    const collection = this.container.getModules();
    const moduleRef = collection.get(this.moduleContext);
    if (!moduleRef) return;

    return moduleRef.injectables.get(metaType.name as string);
  }

  public getGlobalMetadata<T extends unknown[]>(contextId = STATIC_CONTEXT, inquirerId?: string): T {
    if (!this.config) return [] as T;
    const globalInterceptors = this.config.getGlobalInterceptors() as T;
    if (contextId === STATIC_CONTEXT && !inquirerId) return globalInterceptors;

    const scopedInterceptorWrappers = this.config.getGlobalRequestInterceptors() as InstanceWrapper[];
    const scopedInterceptors = iterate(scopedInterceptorWrappers)
      .map(wrapper => wrapper.getInstanceByContextId(contextId, inquirerId))
      .filter(host => !!host)
      .map(host => host.instance)
      .toArray();

    return globalInterceptors.concat(scopedInterceptors) as T;
  }
}
