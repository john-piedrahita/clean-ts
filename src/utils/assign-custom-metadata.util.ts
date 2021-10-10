import { ParamData } from '../decorators';
import { CUSTOM_ROUTE_AGRS_METADATA } from './constants';
import {IHandlerTransform, Type, CustomParamFactory, IRouteParamMetadata} from '../contracts';

export function assignCustomParameterMetadata(
  args: Record<number, IRouteParamMetadata>, paramType: number | string, index: number,
  factory: CustomParamFactory, data?: ParamData, ...pipes: (Type<IHandlerTransform> | IHandlerTransform)[]
) {
  return {
    ...args,
    [`${paramType}${CUSTOM_ROUTE_AGRS_METADATA}:${index}`]: { index, factory, data, pipes }
  };
}
