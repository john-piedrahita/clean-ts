import {ParamData} from "../decorators";
import {IHandlerTransform} from "./handler-transform.interface";

export interface IParamPropertiesContext<T = any, IExtractor extends Function = any> {
    index: number;
    type: T | string;
    data: ParamData;
    handlers: IHandlerTransform[];
    extractValue: IExtractor;
}