import {Logger} from "../services";
import {MISSING_REQUIRED_DEPENDENCY} from "./messages";

const logger = new Logger('PackageLoader');

export function loadAdapter(defaultPlatform: string, transport: string, loaderFn?: Function) {
  try {
    return loaderFn ? loaderFn() : require(defaultPlatform);
  } catch (e) {
    logger.error(MISSING_REQUIRED_DEPENDENCY(defaultPlatform, transport));
    process.exit(1);
  }
}
