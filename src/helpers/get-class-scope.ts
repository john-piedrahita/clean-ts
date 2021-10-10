import { SCOPE_OPTIONS_METADATA } from '../utils';
import {Scope, Type} from "../contracts";

export function getClassScope(provider: Type<unknown>): Scope {
  const metadata = Reflect.getMetadata(SCOPE_OPTIONS_METADATA, provider);
  return metadata && metadata.scope;
}
