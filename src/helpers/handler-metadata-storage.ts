import { CONTROLLER_ID_KEY, IContextId } from '../ioc';
import {Controller, Type, IParamPropertiesContext} from "../contracts";

export const HANDLER_METADATA_SYMBOL = Symbol.for('handler_metadata:cache');

export type IHandleResponseFn = IHandlerResponseBasicFn

export type IHandlerResponseBasicFn = <T, R>(result: T, res: R, req?: any) => any;

export interface IHandlerMetadata {
  argsLength: number;
  paramTypes: any[];
  httpStatusCode: number;
  responseHeaders: any[];
  hasCustomHeaders: boolean;
  getParamsMetadata: (moduleKey: string, contextId?: IContextId, inquirerId?: string) => (IParamPropertiesContext & { metaType?: any })[];
  fnHandleResponse: IHandleResponseFn;
}

export class HandlerMetadataStorage<V = IHandlerMetadata, K extends Type<unknown> = any> {
  private readonly [HANDLER_METADATA_SYMBOL] = new Map<string, V>();

  set(controller: K, methodName: string, metadata: V) {
    const metadataKey = this.getMetadataKey(controller, methodName);
    this[HANDLER_METADATA_SYMBOL].set(metadataKey, metadata);
  }

  get(controller: K, methodName: string): V | undefined {
    const metadataKey = this.getMetadataKey(controller, methodName);
    return this[HANDLER_METADATA_SYMBOL].get(metadataKey);
  }

  protected getMetadataKey(controller: Controller, methodName: string): string {
    const ctor = controller.constructor;
    const controllerKey = ctor && (ctor[CONTROLLER_ID_KEY] || ctor.name);
    return controllerKey + ' ' + methodName;
  }
}
