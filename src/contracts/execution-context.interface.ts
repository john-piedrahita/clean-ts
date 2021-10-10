import { Type } from './index';
import { IArgumentsHost } from './arguments-host.interface';

export interface ExecutionContext extends IArgumentsHost {

  getClass<T = any>(): Type<T>;

  getHandler(): Function;
}
