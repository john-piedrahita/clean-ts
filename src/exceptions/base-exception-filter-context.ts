import { iterate } from 'iterare';
import { ContextCreator } from '../helpers';
import {IExceptionFilter, Type} from "../contracts";
import { STATIC_CONTEXT, CleanContainer, InstanceWrapper } from '../ioc';
import { isEmpty, isFunction, FILTER_CATCH_EXCEPTIONS } from '../utils';

export class BaseExceptionFilterContext extends ContextCreator {
  protected moduleContext: string;

  constructor(private readonly container: CleanContainer) {
    super();
  }

  public createConcreteContext<T extends any[], R extends any[]>(metadata: T, contextId = STATIC_CONTEXT, inquirerId?: string): R {
    if (isEmpty(metadata)) return [] as R;

    return iterate(metadata)
      .filter(instance => instance && (isFunction(instance.catch) || instance.name))
      .map(filter => this.getFilterInstance(filter, contextId, inquirerId))
      .filter(item => !!item)
      .map(instance => ({
        func: instance.catch.bind(instance),
        exceptionMetaTypes: this.reflectCatchExceptions(instance),
      }))
      .toArray() as R;
  }

  public getFilterInstance(filter: Function | IExceptionFilter, contextId = STATIC_CONTEXT, inquirerId?: string): IExceptionFilter | null {
    const isObject = (filter as IExceptionFilter).catch;
    if (isObject) return filter as IExceptionFilter;
    const instanceWrapper = this.getInstanceByMetaType(filter);
    if (!instanceWrapper) return null;

    const instanceHost = instanceWrapper.getInstanceByContextId(contextId, inquirerId);
    return instanceHost && instanceHost.instance;
  }

  public getInstanceByMetaType<T extends Record<string, any>>(filter: T): InstanceWrapper | undefined {
    if (!this.moduleContext) return;
    const collection = this.container.getModules();
    const moduleRef = collection.get(this.moduleContext);
    if (!moduleRef) return;

    return moduleRef.injectables.get(filter.name);
  }

  public reflectCatchExceptions(instance: IExceptionFilter): Type<any>[] {
    const prototype = Object.getPrototypeOf(instance);
    return (Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, prototype.constructor) || []);
  }
}
