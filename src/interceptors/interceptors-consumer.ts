import { isEmpty } from '../utils';
import { ExecutionContextHost } from '../helpers';
import { ContextType, Controller, ICleanInterceptor, Type} from '../contracts';

export class InterceptorsConsumer {

  public async intercept<T extends string = ContextType>(
    interceptors: ICleanInterceptor[], args: unknown[], instance: Controller, callback: () => unknown, next: () => Promise<unknown>, type?: T
  ): Promise<unknown> {

    if (isEmpty(interceptors)) return next();

    const context = this.createContext(args, instance, callback);
    context.setType<T>(type);

    // const start$ = defer(() => this.transformDeferred(next));
    // const nextFn = (i = 0) => async () => {
    //   if (i >= interceptors.length) return start$;
    //
    //   const handler: CallHandler = {
    //     handle: () => fromPromise(nextFn(i + 1)()).pipe(mergeAll()),
    //   };
    //
    //   return interceptors[i].intercept(context, handler);
    // };
    // return nextFn()();
  }

  public createContext(args: unknown[], instance: Controller, callback: () => unknown): ExecutionContextHost {
    return new ExecutionContextHost(args, instance.constructor as Type<unknown>, callback);
  }

  // public transformDeferred(next: () => Promise<any>): Observable<any> {
  //   return fromPromise(next()).pipe(
  //     switchMap(res => {
  //       const isDeferred = res instanceof Promise || res instanceof Observable;
  //       return isDeferred ? res : Promise.resolve(res);
  //     }),
  //   );
  // }
}
