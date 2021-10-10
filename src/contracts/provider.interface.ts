import { IAbstract } from './abstract.interface';
import { Scope } from './scope-options.interface';
import { Type } from './type.interface';

export type Provider<T = any> = Type<any> | IClassProvider<T> | IValueProvider<T> | IFactoryProvider<T> | IExistingProvider<T>;

type GeTypes = string | symbol | Type<any> | IAbstract<any> | Function;

export interface IClassProvider<T = any> {
  provide: GeTypes;
  useClass: Type<T>;
  scope?: Scope;
}

export interface IValueProvider<T = any> {
  provide: GeTypes;
  useValue: T;
}

export interface IFactoryProvider<T = any> {
  provide: GeTypes;
  useFactory: (...args: any[]) => T;
  inject?: Array<Type<any> | string | symbol | IAbstract<any> | Function>;
  scope?: Scope;
}

export interface IExistingProvider<T = any> {
  provide: GeTypes;
  useExisting: any;
}
