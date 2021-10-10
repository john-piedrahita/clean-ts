import { ExecutionContext } from './execution-context.interface';

export interface CallHandler<T = any> {
  handle(): Promise<T>;
}

export interface ICleanInterceptor<T = any, R = any> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Promise<R>;
}
