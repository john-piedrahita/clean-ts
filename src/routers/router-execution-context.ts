import {
  CUSTOM_ROUTE_AGRS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  REDIRECT_METADATA,
  ROUTE_ARGS_METADATA,
  isEmpty, isString
} from '../utils';
import { RouteParamTypes, RequestMethod } from '../enums';
import {
  IHandleResponseFn,
  HandlerMetadataStorage,
  ExecutionContextHost,
  ContextUtils, IHandlerMetadata
} from '../helpers';
import { STATIC_CONTEXT } from '../ioc';
import { InterceptorsConsumer, InterceptorsContextCreator } from '../interceptors';
import { HandlersConsumer, HandlersContextCreator } from '../handlers';
import {
  ICustomHeader,
  IRedirectResponse,
  RouterResponseController,
} from './router-response-controller';
import {
  ContextType,
  Controller,
  IHttpServer,
  IHandlerTransform,
  IRouteParamsFactory,
  IRouteParamMetadata, IParamProperties
} from "../contracts";

export class RouterExecutionContext {
  private readonly handlerMetadataStorage = new HandlerMetadataStorage();
  private readonly contextUtils = new ContextUtils();
  private readonly responseController: RouterResponseController;

  constructor(
    private readonly paramsFactory: IRouteParamsFactory,
    private readonly handlersContextCreator: HandlersContextCreator,
    private readonly handlersConsumer: HandlersConsumer,
    private readonly interceptorsContextCreator: InterceptorsContextCreator,
    private readonly interceptorsConsumer: InterceptorsConsumer,
    readonly applicationRef: IHttpServer,
  ) {
    this.responseController = new RouterResponseController(applicationRef);
  }

  public create(
    instance: Controller, callback: (...args: any[]) => unknown, methodName: string, moduleKey: string,
    requestMethod: RequestMethod, contextId = STATIC_CONTEXT, inquirerId?: string
  ) {
    const contextType: ContextType = 'http';
    const {
      argsLength,
      fnHandleResponse,
      paramTypes,
      getParamsMetadata,
      httpStatusCode,
      responseHeaders,
      hasCustomHeaders,
    } = this.getMetadata(instance, callback, methodName, moduleKey, requestMethod, contextType);

    const paramsOptions = this.contextUtils.mergeParamsMetaTypes(getParamsMetadata(moduleKey, contextId, inquirerId), paramTypes);
    const pipes = this.handlersContextCreator.create(instance, callback, moduleKey, contextId, inquirerId);
    const interceptors = this.interceptorsContextCreator.create(instance, callback, moduleKey, contextId, inquirerId);
    const fnApplyPipes = this.createPipesFn(pipes, paramsOptions);

    const handler = <T, R>(args: any[], req: T, res: R, next: Function) => async () => {
      fnApplyPipes && (await fnApplyPipes(args, req, res, next));
      return callback.apply(instance, args);
    };

    return async <T, R>(req: T, res: R, next: Function) => {
      const args = this.contextUtils.createNullArray(argsLength);
      this.responseController.setStatus(res, httpStatusCode);
      hasCustomHeaders && this.responseController.setHeaders(res, responseHeaders);

      const result = await this.interceptorsConsumer.intercept(
          interceptors, [req, res, next], instance, callback, handler(args, req, res, next), contextType
      );
      await (fnHandleResponse)(result, res, req);
    };
  }

  public getMetadata<T extends ContextType = ContextType>(
    instance: Controller, callback: (...args: any[]) => any, methodName: string,
    moduleKey: string, requestMethod: RequestMethod, contextType: T,
  ): IHandlerMetadata {
    const cacheMetadata = this.handlerMetadataStorage.get(instance, methodName);
    if (cacheMetadata) return cacheMetadata;

    const metadata = this.contextUtils.reflectCallbackMetadata(instance, methodName, ROUTE_ARGS_METADATA) || {};
    const keys = Object.keys(metadata);
    const argsLength = this.contextUtils.getArgumentsLength(keys, metadata);
    const paramTypes = this.contextUtils.reflectCallbackParamTypes(instance, methodName);
    const contextFactory = this.contextUtils.getContextFactory(contextType, instance, callback);

    const getParamsMetadata = (key: string, contextId = STATIC_CONTEXT, inquirerId?: string) =>
      this.exchangeKeysForValues(keys, metadata, key, contextId, inquirerId, contextFactory);

    const paramsMetadata = getParamsMetadata(moduleKey);
    const isResponseHandled = this.isResponseHandled(instance, methodName, paramsMetadata);
    const httpRedirectResponse = this.reflectRedirect(callback);
    const fnHandleResponse = this.createHandleResponseFn(callback, isResponseHandled, httpRedirectResponse);
    const httpCode = this.reflectHttpStatusCode(callback);
    const httpStatusCode = httpCode ? httpCode : this.responseController.getStatusByMethod(requestMethod);
    const responseHeaders = this.reflectResponseHeaders(callback);
    const hasCustomHeaders = !isEmpty(responseHeaders);
    const handlerMetadata: IHandlerMetadata = {
      argsLength,
      fnHandleResponse,
      paramTypes,
      getParamsMetadata,
      httpStatusCode,
      hasCustomHeaders,
      responseHeaders,
    };
    this.handlerMetadataStorage.set(instance, methodName, handlerMetadata);
    return handlerMetadata;
  }

  public reflectRedirect(callback: (...args: unknown[]) => unknown): IRedirectResponse {
    return Reflect.getMetadata(REDIRECT_METADATA, callback);
  }

  public reflectHttpStatusCode(callback: (...args: unknown[]) => unknown): number {
    return Reflect.getMetadata(HTTP_CODE_METADATA, callback);
  }

  public reflectResponseHeaders(callback: (...args: unknown[]) => unknown): ICustomHeader[] {
    return Reflect.getMetadata(HEADERS_METADATA, callback) || [];
  }

  public exchangeKeysForValues(
    keys: string[], metadata: Record<number, IRouteParamMetadata>, moduleContext: string,
    contextId = STATIC_CONTEXT, inquirerId?: string, contextFactory?: (args: unknown[]) => ExecutionContextHost
  ): IParamProperties[] {

    this.handlersContextCreator.setModuleContext(moduleContext);

    return keys.map(key => {
      const { index, data, handlers: handlersCollection } = metadata[key];
      const handlers = this.handlersContextCreator.createConcreteContext(handlersCollection, contextId, inquirerId);
      const type = this.contextUtils.mapParamType(key);

      if (key.includes(CUSTOM_ROUTE_AGRS_METADATA)) {
        const { factory } = metadata[key];
        const customExtractValue = this.contextUtils.getCustomFactory(factory, data, contextFactory);
        return { index, extractValue: customExtractValue, type, data, handlers };
      }
      const numericType = Number(type);
      const extractValue = <T, R>(req: T, res: R, next: Function) =>
        this.paramsFactory.exchangeKeyForValue(numericType, data, {req, res, next});

      return { index, extractValue, type: numericType, data, handlers };
    });
  }

  public async getParamValue<T>(value: T, { metaType, type, data}: { metaType: unknown; type: RouteParamTypes; data: unknown }, handlers: IHandlerTransform[]): Promise<unknown> {
    if (!isEmpty(handlers)) return this.handlersConsumer.apply(value, { metaType, type, data } as any, handlers);
    return value;
  }

  public isHandleable(type: number | string): boolean {
    return (
      type === RouteParamTypes.BODY ||
      type === RouteParamTypes.QUERY ||
      type === RouteParamTypes.PARAM ||
      type === RouteParamTypes.FILE ||
      type === RouteParamTypes.FILES ||
      isString(type)
    );
  }

  public createPipesFn(handlers: IHandlerTransform[], paramsOptions: (IParamProperties & { metaType?: any })[],) {
    const handlersFn = async <T, R>(args: any[], req: T, res: R, next: Function) => {
      const resolveParamValue = async (param: IParamProperties & { metaType?: any }) => {
        const { index, extractValue, type, data, metaType, handlers: paramPipes} = param;
        const value = extractValue(req, res, next);
        args[index] = this.isHandleable(type) ? await this.getParamValue(value, { metaType, type, data } as any, handlers.concat(paramPipes)) : value;
      };
      await Promise.all(paramsOptions.map(resolveParamValue));
    };
    return paramsOptions.length ? handlersFn : null;
  }

  public createHandleResponseFn(
    callback: (...args: unknown[]) => unknown, isResponseHandled: boolean, redirectResponse?: IRedirectResponse, httpStatusCode?: number
  ): IHandleResponseFn {

    if (redirectResponse && typeof redirectResponse.url === 'string') {
      return async <T, R>(result: T, res: R) => {
        await this.responseController.redirect(result, res, redirectResponse);
      };
    }

    return async <T, R>(result: T, res: R) => {
      result = await this.responseController.transformToResult(result);
      !isResponseHandled && (await this.responseController.apply(result, res, httpStatusCode));
    };
  }

  private isResponseHandled(instance: Controller, methodName: string, paramsMetadata: IParamProperties[]): boolean {
    const hasResponseOrNextDecorator = paramsMetadata.some(({ type }) => type === RouteParamTypes.RESPONSE || type === RouteParamTypes.NEXT);
    const isPassthroughsEnabled = this.contextUtils.reflectPassthroughs(instance, methodName);
    return hasResponseOrNextDecorator && !isPassthroughsEnabled;
  }
}
