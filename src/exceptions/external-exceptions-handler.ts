import {isEmpty} from '../utils';
import {ExternalExceptionFilter} from './external-exception-filter';
import {IArgumentsHost, IExceptionFilterMetadata, Type} from "../contracts";
import {InvalidExceptionFilterException} from "./invalid-exception-filter.exception";

export class ExternalExceptionsHandler extends ExternalExceptionFilter {
  private filters: IExceptionFilterMetadata[] = [];

  public next(exception: Error | any, host: IArgumentsHost): Promise<any> {
    const result = this.invokeCustomFilters(exception, host);
    if (result) return result;

    return super.catch(exception, host);
  }

  public setCustomFilters(filters: IExceptionFilterMetadata[]) {
    if (!Array.isArray(filters)) throw new InvalidExceptionFilterException();
    this.filters = filters;
  }

  public invokeCustomFilters<T = any>(exception: T, host: IArgumentsHost): Promise<any> | null {
    if (isEmpty(this.filters)) return null;
    const isInstanceOf = (metaType: Type<unknown>) => exception instanceof metaType;

    const filter = this.filters.find(({ exceptionMetaTypes }) => {
      return !exceptionMetaTypes.length || exceptionMetaTypes.some(isInstanceOf);
    });

    return filter ? filter.func(exception, host) : null;
  }
}
