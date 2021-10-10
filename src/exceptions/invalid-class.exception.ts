import {RuntimeException} from "./runtime.exception";
import {INVALID_CLASS_MESSAGE} from "./messages";

export class InvalidClassException extends RuntimeException {
  constructor(value: any) {
    super(INVALID_CLASS_MESSAGE`${value}`);
  }
}
