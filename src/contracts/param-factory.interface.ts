import {ParamData} from "../decorators";

export interface IParamsFactory {
    exchangeKeyForValue(type: number, data: ParamData, args: any): any;
}