import { INQUIRER } from './inquirer-constants';
import {Provider, Scope} from "../../contracts";

export const inquirerProvider: Provider = {
  provide: INQUIRER,
  scope: Scope.TRANSIENT,
  useFactory: (obj) => obj
};
