import { IContextId } from '../ioc';
import {ExceptionsHandler} from "../exceptions";
import {Controller} from "./controller.interface";

export interface IExceptionsFilter {
  create(instance: Controller, callback: Function, module: string, contextId?: IContextId, inquirerId?: string): ExceptionsHandler;
}
