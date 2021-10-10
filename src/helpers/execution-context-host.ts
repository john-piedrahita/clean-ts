import {ContextType, ExecutionContext, IHttpArgumentsHost, Type} from "../contracts";

export class ExecutionContextHost implements ExecutionContext {

  private contextType = 'http';

  constructor(
    private readonly args: any[],
    private readonly constructorRef: Type<any> = null,
    private readonly handler: Function = null,
  ) {}

  setType<T extends string = ContextType>(type: T) {
    type && (this.contextType = type);
  }

  getType<T extends string = ContextType>(): T {
    return this.contextType as T;
  }

  getClass<T = any>(): Type<T> {
    return this.constructorRef;
  }

  getHandler(): Function {
    return this.handler;
  }

  getArgs<T extends Array<any> = any[]>(): T {
    return this.args as T;
  }

  getArgByIndex<T = any>(index: number): T {
    return this.args[index] as T;
  }

  switchToHttp(): IHttpArgumentsHost {
    return Object.assign(this, {
      getRequest: () => this.getArgByIndex(0),
      getResponse: () => this.getArgByIndex(1),
      getNext: () => this.getArgByIndex(2),
    });
  }

}
