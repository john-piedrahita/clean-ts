import {Type} from "./type.interface";

export type InjectorDependency = Type<any> | Function | string | symbol;

export interface IPropertyDependency {
    key: string;
    name: InjectorDependency;
    isOptional?: boolean;
    instance?: any;
}

export interface IInjectorDependencyContext {
    key?: string | symbol;
    name?: string | symbol;
    index?: number;
    dependencies?: InjectorDependency[];
}