import { Type } from './type.interface';
import { Paramtype } from './paramtype.interface';

export type Transform<T = any> = (value: T, metadata: IArgumentMetadata) => any;

export interface IArgumentMetadata {
  readonly type: Paramtype;
  readonly metaType: Type<any> | undefined;
  readonly data: string | undefined;
}

export interface IHandlerTransform<T = any, R = any> {
  transform(value: T, metadata: IArgumentMetadata): R;
}
