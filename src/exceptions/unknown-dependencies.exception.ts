import {Module} from "../ioc";
import {RuntimeException} from "./runtime.exception";
import {UNKNOWN_DEPENDENCIES_MESSAGE} from "./messages";
import {IInjectorDependencyContext} from "../contracts";

export class UnknownDependenciesException extends RuntimeException {
  constructor(type: string | symbol, unknownDependencyContext: IInjectorDependencyContext, module?: Module) {
    super(UNKNOWN_DEPENDENCIES_MESSAGE(type, unknownDependencyContext, module));
  }
}
