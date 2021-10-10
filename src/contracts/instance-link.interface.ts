import {Type} from "./type.interface";
import {IAbstract} from "./abstract.interface";
import {InstanceWrapper} from "../ioc";

export type InstanceToken = string | symbol | Type<any> | IAbstract<any> | Function;

export interface InstanceLink<T = any> {
    token: InstanceToken;
    wrapperRef: InstanceWrapper<T>;
    collection: Map<any, InstanceWrapper>;
    moduleId: string;
}