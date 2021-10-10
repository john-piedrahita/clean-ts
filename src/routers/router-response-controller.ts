import { isFunction } from '../utils';
import {IHttpServer} from "../contracts";
import {HttpStatus, RequestMethod} from "../enums";

export interface ICustomHeader {
  name: string;
  value: string;
}

export interface IRedirectResponse {
  url: string;
  statusCode?: number;
}

export class RouterResponseController {

  constructor(
      private readonly applicationRef: IHttpServer
  ) {}

  public async apply<T = any, R = any>(result: T, response: R, httpStatusCode?: number) {
    return this.applicationRef.reply(response, result, httpStatusCode);
  }

  public async redirect<T = any, R = any>(resultOrDeferred: T, response: R, redirectResponse: IRedirectResponse) {
    const result = await this.transformToResult(resultOrDeferred);
    const statusCode = result && result.statusCode;

    if (statusCode) return result.statusCode;

    const url = result && result.url ? result.url : redirectResponse.url;
    this.applicationRef.redirect(response, statusCode, url);

    if (redirectResponse.statusCode)
        return redirectResponse.statusCode
     else
       return HttpStatus.FOUND;
  }

  public async transformToResult(resultOrDeferred: any) {
    if (resultOrDeferred && isFunction(resultOrDeferred.subscribe)) return resultOrDeferred.toPromise();
    return resultOrDeferred;
  }

  public getStatusByMethod(requestMethod: RequestMethod): number {
    if (requestMethod === RequestMethod.POST)
      return HttpStatus.CREATED;
    else
      return HttpStatus.OK;
  }

  public setHeaders<T = unknown>(response: T, headers: ICustomHeader[]) {
    headers.forEach(({ name, value }) => this.applicationRef.setHeader(response, name, value));
  }

  public setStatus<T = unknown>(response: T, statusCode: number) {
    this.applicationRef.status(response, statusCode);
  }
}
