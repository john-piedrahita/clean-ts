import { REQUEST } from './request-constants';
import {Provider, Scope} from "../../contracts";

export const requestProvider: Provider = {
  provide: REQUEST,
  scope: Scope.REQUEST,
  useFactory: (obj) => obj,
};
