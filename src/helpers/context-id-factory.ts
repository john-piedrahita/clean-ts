import randomNumber from 'random-number'
import { IContextId } from '../ioc';
import { REQUEST_CONTEXT_ID } from '../routers/request/request-constants';

export function createContextId(): IContextId {
  return { id: randomNumber() };
}

export class ContextIdFactory {

  public static create(): IContextId {
    return createContextId();
  }

  public static getByRequest<T extends Record<any, any> = any>(request: T): IContextId {
    if (!request) return createContextId();

    if (request[REQUEST_CONTEXT_ID as any]) return request[REQUEST_CONTEXT_ID as any];

    if (request.raw && request.raw[REQUEST_CONTEXT_ID]) return request.raw[REQUEST_CONTEXT_ID];

    return createContextId();
  }
}
