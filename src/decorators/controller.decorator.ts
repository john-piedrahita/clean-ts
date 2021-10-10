import {
    HOST_METADATA,
    PATH_METADATA,
    SCOPE_OPTIONS_METADATA, isString, isUndefined
} from '../utils';
import {ControllerOptions} from "../contracts";

export function Mapping(): ClassDecorator;

export function Mapping(prefix: string | string[]): ClassDecorator;

export function Mapping(options: ControllerOptions): ClassDecorator;

export function Mapping(prefixOrOptions?: string | string[] | ControllerOptions): ClassDecorator {
    const defaultPath = '/';

    const [path, host, scopeOptions] = isUndefined(prefixOrOptions)
        ? [defaultPath, undefined, undefined] : isString(prefixOrOptions) || Array.isArray(prefixOrOptions)
            ? [prefixOrOptions, undefined, undefined] : [prefixOrOptions.path || defaultPath, prefixOrOptions.host, {scope: prefixOrOptions.scope}];

    return (target: object) => {
        Reflect.defineMetadata(PATH_METADATA, path, target);
        Reflect.defineMetadata(HOST_METADATA, host, target);
        Reflect.defineMetadata(SCOPE_OPTIONS_METADATA, scopeOptions, target);
    };
}
