import {Module} from "../ioc";
import {RuntimeException} from "./runtime.exception";
import {UNKNOWN_DEPENDENCIES_MESSAGE} from "./messages";
import {IInjectorDependencyContext} from "../contracts";

export class UndefinedDependencyException extends RuntimeException {
  constructor(type: string, undefinedDependencyContext: IInjectorDependencyContext, module?: Module) {
    super(
      UNKNOWN_DEPENDENCIES_MESSAGE(type, undefinedDependencyContext, module),
    );
  }
}
