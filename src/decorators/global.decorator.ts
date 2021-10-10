import { GLOBAL_MODULE_METADATA } from '../utils';

export function Global(): ClassDecorator {
  return (target: Function) => {
    Reflect.defineMetadata(GLOBAL_MODULE_METADATA, true, target);
  };
}
