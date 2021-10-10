import { iterate } from 'iterare';

import { ApplicationConfig } from '../app';
import {Controller, IHttpServer} from "../contracts";
import { IRouterProxyCallback } from './router-proxy';
import { EXCEPTION_FILTERS_METADATA, isEmpty } from '../utils';
import { STATIC_CONTEXT, CleanContainer, InstanceWrapper } from '../ioc';
import { BaseExceptionFilterContext, ExceptionsHandler } from '../exceptions';

export class RouterExceptionFilters extends BaseExceptionFilterContext {
  constructor(
    container: CleanContainer,
    private readonly config: ApplicationConfig,
    private readonly applicationRef: IHttpServer,
  ) {
    super(container);
  }

  public create(
    instance: Controller, callback: IRouterProxyCallback, moduleKey: string, contextId = STATIC_CONTEXT, inquirerId?: string
  ): ExceptionsHandler {

    this.moduleContext = moduleKey;
    const exceptionHandler = new ExceptionsHandler(this.applicationRef);
    const filters = this.createContext(instance, callback, EXCEPTION_FILTERS_METADATA, contextId, inquirerId);
    if (isEmpty(filters)) return exceptionHandler;

    exceptionHandler.setCustomFilters(filters.reverse());
    return exceptionHandler;
  }

  public getGlobalMetadata<T extends unknown[]>(contextId = STATIC_CONTEXT, inquirerId?: string): T {
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
