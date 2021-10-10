import { LoggerService, LogLevel } from '../services';
import { IAbstract } from './abstract.interface';
import { IDynamicModule } from "./dynamic-module.interface";
import { Type } from "./type.interface";

export interface ICleanApplicationContext {

  select<T>(module: Type<T> | IDynamicModule): ICleanApplicationContext;

  get<T = any, R = T>(typeOrToken: Type<T> | IAbstract<T> | string | symbol, options?: { strict: boolean }): R;

  resolve<T = any, R = T>(typeOrToken: Type<T> | IAbstract<T> | string | symbol, contextId?: { id: number }, options?: { strict: boolean }): Promise<R>;

  registerRequestByContextId<T = any>(request: T, contextId: { id: number }): void;

  close(): Promise<void>;

  useLogger(logger: LoggerService | LogLevel[] | false): void;

  init(): Promise<this>;
}
