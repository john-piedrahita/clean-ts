import { IContextId } from '../ioc';
import {IParamProperties} from "./param-properties.interface";

type ParamPropertiesWithMetaType<T = any> = IParamProperties & { metaType?: T };

export interface IExternalHandlerMetadata {

  argsLength: number;

  paramTypes: any[];

  getParamsMetadata: (moduleKey: string, contextId?: IContextId, inquirerId?: string) => ParamPropertiesWithMetaType[];

}
