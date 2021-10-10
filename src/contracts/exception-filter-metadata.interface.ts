import { Type } from './type.interface';
import { IExceptionFilter } from './exception-filter.interface';

export interface IExceptionFilterMetadata {
  func: IExceptionFilter['catch'];
  exceptionMetaTypes: Type<any>[];
}
