import {isEmpty} from '../utils';
import {HttpException} from "./http.exception";
import {BaseExceptionFilter} from './base-exception-filter';
import {IArgumentsHost, IExceptionFilterMetadata, Type} from "../contracts";
import {InvalidExceptionFilterException} from "./invalid-exception-filter.exception";

export class ExceptionsHandler extends BaseExceptionFilter {

  private filters: IExceptionFilterMetadata[] = [];

  public next(exception: Error | HttpException | any, ctx: IArgumentsHost) {
    if (this.invokeCustomFilters(exception, ctx)) return;
    super.catch(exception, ctx);
  }

  public setCustomFilters(filters: IExceptionFilterMetadata[]): void {
    if (!Array.isArray(filters)) throw new InvalidExceptionFilterException();
    this.filters = filters;
  }

  public invokeCustomFilters<T = any>(exception: T, ctx: IArgumentsHost): boolean {
    if (isEmpty(this.filters)) return false;

    const isInstanceOf = (metaType: Type<unknown>) => exception instanceof metaType;

    const filter = this.filters.find(({ exceptionMetaTypes }) => {
      return !exceptionMetaTypes.length || exceptionMetaTypes.some(isInstanceOf);
    });
    filter && filter.func(exception, ctx);
    return !!filter;
  }
}
