import { iterate } from 'iterare';
import { ApplicationConfig } from '../app';
import { IRouterProxyCallback } from '../routers';
import { EXCEPTION_FILTERS_METADATA, isEmpty } from '../utils';
import {Controller, IExceptionFilterMetadata} from '../contracts';
import { STATIC_CONTEXT, CleanContainer, InstanceWrapper } from '../ioc';
import { BaseExceptionFilterContext } from './base-exception-filter-context';
import { ExternalExceptionsHandler } from './external-exceptions-handler';

export class ExternalExceptionFilterContext extends BaseExceptionFilterContext {

  constructor(container: CleanContainer, private readonly config?: ApplicationConfig) {
    super(container);
  }

  public create(
    instance: Controller, callback: IRouterProxyCallback, module: string, contextId = STATIC_CONTEXT, inquirerId?: string
  ): ExternalExceptionsHandler {
    this.moduleContext = module;

    const exceptionHandler = new ExternalExceptionsHandler();
    const filters = this.createContext<IExceptionFilterMetadata[]>(instance, callback, EXCEPTION_FILTERS_METADATA, contextId, inquirerId);
    if (isEmpty(filters)) return exceptionHandler;

    exceptionHandler.setCustomFilters(filters.reverse());
    return exceptionHandler;
  }

  public getGlobalMetadata<T extends any[]>(contextId = STATIC_CONTEXT, inquirerId?: string): T {
    if (!this.config) return [] as T;
    const globalFilters = this.config.getGlobalFilters() as T;
    if (contextId === STATIC_CONTEXT && !inquirerId) return globalFilters;

    const scopedFilterWrappers = this.config.getGlobalRequestFilters() as InstanceWrapper[];
    const scopedFilters = iterate(scopedFilterWrappers)
      .map(wrapper => wrapper.getInstanceByContextId(contextId, inquirerId))
      .filter(host => !!host)
      .map(host => host.instance)
      .toArray();

    return globalFilters.concat(scopedFilters) as T;
  }
}
