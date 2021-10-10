import {Paramtype} from "../contracts";
import { RouteParamTypes } from '../enums';

export class ParamsTokenFactory {
  public exchangeEnumForString(type: RouteParamTypes): Paramtype {
    switch (type) {
      case RouteParamTypes.BODY:
        return 'body';
      case RouteParamTypes.PARAM:
        return 'param';
      case RouteParamTypes.QUERY:
        return 'query';
      default:
        return 'custom';
    }
  }
}
