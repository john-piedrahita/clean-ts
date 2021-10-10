import { ExceptionsHandler } from '../exceptions';
import { ExecutionContextHost } from '../helpers';

export type IRouterProxyCallback = <T, R>(req?: T, res?: R, next?: () => void) => void;

export class RouterProxy {

  public createProxy(targetCallback: IRouterProxyCallback, exceptionsHandler: ExceptionsHandler) {
    return <T, R>(req: T, res: R, next: () => void) => {
      try {
        targetCallback(req, res, next);
      } catch (e) {
        const host = new ExecutionContextHost([req, res, next]);
        exceptionsHandler.next(e, host);
      }
    };
  }

  public createExceptionLayerProxy(targetCallback: <E, T, R>(err: E, req: T, res: R, next: () => void) => void, exceptionsHandler: ExceptionsHandler) {
    return <E, T, R>(err: E, req: T, res: R, next: () => void) => {
      try {
        targetCallback(err, req, res, next);
      } catch (e) {
        const host = new ExecutionContextHost([req, res, next]);
        exceptionsHandler.next(e, host);
      }
    };
  }
}
