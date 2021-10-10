import {RuntimeException} from "./runtime.exception";
import {INVALID_MODULE_MESSAGE} from "./messages";

export class InvalidModuleException extends RuntimeException {
  constructor(parentModule: any, index: number, scope: any[]) {
    super(INVALID_MODULE_MESSAGE(parentModule, index, scope));
  }
}
