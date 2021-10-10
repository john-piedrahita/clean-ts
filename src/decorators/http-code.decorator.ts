import { HTTP_CODE_METADATA } from '../utils';

export function HttpCode(statusCode: number): MethodDecorator {
  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    Reflect.defineMetadata(HTTP_CODE_METADATA, statusCode, descriptor.value);
    return descriptor;
  };
}
