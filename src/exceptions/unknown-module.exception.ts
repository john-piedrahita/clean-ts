import {RuntimeException} from "./runtime.exception";

export class UnknownModuleException extends RuntimeException {
  constructor() {
    super(
      'Clean could not select the given container (it does not exist in current context)',
    );
  }
}
