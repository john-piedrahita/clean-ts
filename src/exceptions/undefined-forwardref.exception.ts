import {RuntimeException} from "./runtime.exception";
import {Type} from "../contracts";
import {UNDEFINED_FORWARD_REF_MESSAGE} from "./messages";

export class UndefinedForwardRefException extends RuntimeException {
  constructor(scope: Type<any>[]) {
    super(UNDEFINED_FORWARD_REF_MESSAGE(scope));
  }
}
