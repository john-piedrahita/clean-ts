import {Type} from "./type.interface";
import {IDynamicModule} from "./dynamic-module.interface";

export interface ModuleFactory {
    type: Type<any>;
    token: string;
    dynamicMetadata?: Partial<IDynamicModule>;
}