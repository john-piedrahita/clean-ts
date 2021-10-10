import { Type } from './type.interface';
import { Provider } from './provider.interface';
import { IAbstract } from './abstract.interface';
import { IDynamicModule } from './dynamic-module.interface';
import { ForwardReference } from './forward-reference.interface';

export interface IModuleMetadata {
  adapters?: Provider[];
  imports?: Array<Type<any> | IDynamicModule | Promise<IDynamicModule> | ForwardReference>;
  controllers?: Type<any>[];
  providers?: Provider[];
  exports?: Array<IDynamicModule | Promise<IDynamicModule> | string | symbol | Provider | ForwardReference | IAbstract<any> | Function>;
}
