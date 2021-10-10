import {RouteParamTypes} from "../enums";
import {ParamData} from "../decorators";
import {IHandlerTransform} from "./handler-transform.interface";

export interface IParamProperties {
    index: number;
    type: RouteParamTypes | string;
    data: ParamData;
    handlers: IHandlerTransform[];
    extractValue: <T, R>(req: T, res: R, next: Function) => any;
}