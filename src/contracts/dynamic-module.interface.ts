import { Type } from './type.interface';
import { IModuleMetadata } from './module-metadata.interface';

export interface IDynamicModule extends IModuleMetadata {
  module: Type<any>;
  global?: boolean;
}
