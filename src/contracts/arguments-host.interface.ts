export type ContextType = 'http';

export interface IHttpArgumentsHost {
  getRequest<T = any>(): T;
  getResponse<T = any>(): T;
  getNext<T = any>(): T;
}

export interface IArgumentsHost {
  getArgs<T extends Array<any> = any[]>(): T;
  getArgByIndex<T = any>(index: number): T;
  switchToHttp(): IHttpArgumentsHost;
  getType<T extends string = ContextType>(): T;
}
