import {isFunction} from "../utils";
import {IAbstract, Type} from "../contracts";
import {RuntimeException} from "./runtime.exception";
import {INVALID_CLASS_SCOPE_MESSAGE} from "./messages";

export class InvalidClassScopeException extends RuntimeException {
  constructor(metaTypeOrToken: Type<any> | IAbstract<any> | string | symbol) {
    let name = isFunction(metaTypeOrToken) ? (metaTypeOrToken as Function).name : metaTypeOrToken;
    name = name && name.toString();
    super(INVALID_CLASS_SCOPE_MESSAGE`${name}`);
  }
}
