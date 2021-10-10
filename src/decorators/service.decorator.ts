import {ScopeOptions} from "../contracts";
import {SCOPE_OPTIONS_METADATA} from "../utils";

export function Service(options?: ScopeOptions): ClassDecorator {
    return (target: object) => Reflect.defineMetadata(SCOPE_OPTIONS_METADATA, options, target);
}
