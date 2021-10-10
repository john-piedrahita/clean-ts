import { iterate } from 'iterare';
import { ApplicationConfig } from '../app';
import { ContextCreator } from '../helpers';
import { Controller, IHandlerTransform } from '../contracts';
import { HANDLERS_METADATA, isEmpty, isFunction } from '../utils';
import { STATIC_CONTEXT, CleanContainer, InstanceWrapper } from '../ioc';

export class HandlersContextCreator extends ContextCreator {
  private moduleContext: string;

  constructor(
    private readonly container: CleanContainer,
    private readonly config?: ApplicationConfig,
  ) {
    super();
  }

  public create(
      instance: Controller, callback: (...args: unknown[]) => unknown, moduleKey: string, contextId = STATIC_CONTEXT, inquirerId?: string
  ): IHandlerTransform[] {
    this.moduleContext = moduleKey;
    return this.createContext(instance, callback, HANDLERS_METADATA, contextId, inquirerId);
  }

  public createConcreteContext<T extends any[], R extends any[]>(metadata: T, contextId = STATIC_CONTEXT, inquirerId?: string): R {
    if (isEmpty(metadata)) return [] as R;

    return iterate(metadata)
      .filter((pipe: any) => pipe && (pipe.name || pipe.transform))
      .map(pipe => this.getHandlerInstance(pipe, contextId, inquirerId))
      .filter(pipe => pipe && pipe.transform && isFunction(pipe.transform))
      .toArray() as R;
  }

  public getHandlerInstance(handler: Function | IHandlerTransform, contextId = STATIC_CONTEXT, inquirerId?: string): IHandlerTransform | null {
    const isObject = (handler as IHandlerTransform).transform;
    if (isObject) return handler as IHandlerTransform;

    const instanceWrapper = this.getInstanceByMetaType(handler as Function);
    if (!instanceWrapper) return null;

    const instanceHost = instanceWrapper.getInstanceByContextId(contextId, inquirerId);
    return instanceHost && instanceHost.instance;
  }

  public getInstanceByMetaType<T extends Record<'name', string> = any>(metaType: T): InstanceWrapper | undefined {
    if (!this.moduleContext) return;

    const collection = this.container.getModules();
    const moduleRef = collection.get(this.moduleContext);
    if (!moduleRef) return;

    return moduleRef.injectables.get(metaType.name);
  }

  public getGlobalMetadata<T extends unknown[]>(contextId = STATIC_CONTEXT, inquirerId?: string): T {
    if (!this.config) return [] as T;

    const globalPipes = this.config.getGlobalHandlers() as T;
    if (contextId === STATIC_CONTEXT && !inquirerId) return globalPipes;

    const scopedPipeWrappers = this.config.getGlobalRequestHandler() as InstanceWrapper[];
    const scopedPipes = iterate(scopedPipeWrappers)
      .map(wrapper => wrapper.getInstanceByContextId(contextId, inquirerId))
      .filter(host => !!host)
      .map(host => host.instance)
      .toArray();

    return globalPipes.concat(scopedPipes) as T;
  }

  public setModuleContext(context: string) {
    this.moduleContext = context;
  }
}
