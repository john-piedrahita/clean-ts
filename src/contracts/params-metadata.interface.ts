import {ParamData} from "../decorators";

export type ParamsMetadata = Record<number, IParamMetadata>;

export interface IParamMetadata {
  index: number;
  data?: ParamData;
}
