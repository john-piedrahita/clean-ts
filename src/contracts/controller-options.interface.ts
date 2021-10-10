import {ScopeOptions} from "./scope-options.interface";

export interface ControllerOptions extends ScopeOptions {
    path?: string | string[];
    host?: string | string[];
}