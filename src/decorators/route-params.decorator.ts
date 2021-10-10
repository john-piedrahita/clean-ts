import {
  RESPONSE_PASSTHROUGH_METADATA,
  ROUTE_ARGS_METADATA,
  isNil, isString
} from '../utils';
import { RouteParamTypes } from '../enums';
import {IHandlerTransform, IResponseDecoratorOptions, IRouteParamMetadata, Type} from '../contracts';

export type ParamData = object | string | number;

export function assignMetadata<P = any, A = any>(args: A, paramType: P, index: number, data?: ParamData, ...handlers: (Type<IHandlerTransform> | IHandlerTransform)[]) {
  return {
    ...args,
    [`${paramType}:${index}`]: { index, data, handlers }
  };
}

function createRouteParamDecorator(paramType: RouteParamTypes) {
  return (data?: ParamData): ParameterDecorator => (target, key, index) => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key) || {};

    Reflect.defineMetadata(
      ROUTE_ARGS_METADATA,
      assignMetadata<RouteParamTypes, Record<number, IRouteParamMetadata>>(args, paramType, index, data),
      target.constructor,
      key,
    );
  };
}

const createPipesRouteParamDecorator = (paramType: RouteParamTypes) => (
  data?: any, ...pipes: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator => (target, key, index) => {

  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key) || {};
  const hasParamData = isNil(data) || isString(data);
  const paramData = hasParamData ? data : undefined;
  const paramHandlers = hasParamData ? pipes : [data, ...pipes];

  Reflect.defineMetadata(
    ROUTE_ARGS_METADATA, assignMetadata(args, paramType, index, paramData, ...paramHandlers), target.constructor, key
  );
};

export const Request: () => ParameterDecorator = createRouteParamDecorator(RouteParamTypes.REQUEST);

export const Response: (options?: IResponseDecoratorOptions,) => ParameterDecorator = (options?: IResponseDecoratorOptions) => (
  target, key, index
) => {
  if (options?.passThrough) {
    Reflect.defineMetadata(RESPONSE_PASSTHROUGH_METADATA, options?.passThrough, target.constructor, key);
  }
  return createRouteParamDecorator(RouteParamTypes.RESPONSE)()(target, key, index);
};

export function Query(): ParameterDecorator;

export function Query(...handlers: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator;

export function Query(property: string, ...handlers: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator;

export function Query(property?: string | (Type<IHandlerTransform> | IHandlerTransform), ...handlers: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamTypes.QUERY)(property, ...handlers);
}

export function Body(): ParameterDecorator;

export function Body(...handlers: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator;

export function Body(property: string, ...handlers: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator;

export function Body(property?: string | (Type<IHandlerTransform> | IHandlerTransform), ...pipes: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamTypes.BODY)(property, ...pipes);
}

export function Param(): ParameterDecorator;

export function Param(...handlers: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator;

export function Param(property: string, ...handlers: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator;

export function Param(property?: string | (Type<IHandlerTransform> | IHandlerTransform), ...pipes: (Type<IHandlerTransform> | IHandlerTransform)[]): ParameterDecorator {
  return createPipesRouteParamDecorator(RouteParamTypes.PARAM)(property, ...pipes);
}

export const Req = Request;
export const Res = Response;
