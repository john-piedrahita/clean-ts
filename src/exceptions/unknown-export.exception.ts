import {RuntimeException} from "./runtime.exception";
import {UNKNOWN_EXPORT_MESSAGE} from "./messages";

export class UnknownExportException extends RuntimeException {
  constructor( moduleName: string, token: string | symbol) {
    super(UNKNOWN_EXPORT_MESSAGE(moduleName, token));
  }
}
