import { IArgumentsHost } from './arguments-host.interface';

export interface IExceptionFilter<T = any> {
  catch(exception: T, host: IArgumentsHost): any;
}
