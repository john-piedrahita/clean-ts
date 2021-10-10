import { v4 as uuid } from 'uuid';
import { SCOPE_OPTIONS_METADATA } from '../utils';
import { ScopeOptions, Type } from '../contracts';

export function Injectable(options?: ScopeOptions): ClassDecorator {
  return (target: object) => {
    Reflect.defineMetadata(SCOPE_OPTIONS_METADATA, options, target);
  };
}

export function mixin(mixinClass: Type<any>) {
  Object.defineProperty(mixinClass, 'name', {
    value: uuid(),
  });
  Injectable()(mixinClass);
  return mixinClass;
}
