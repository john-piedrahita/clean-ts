import {Type} from "./type.interface";
import {IAbstract} from "./abstract.interface";
import {Scope} from "./scope-options.interface";

export interface IApplicationProviderWrapper {
    moduleKey: string;
    providerKey: string;
    type: string | symbol | Type<any> | IAbstract<any> | Function;
    scope?: Scope;
}