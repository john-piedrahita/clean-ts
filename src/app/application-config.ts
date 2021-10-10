import {InstanceWrapper} from "../ioc";
import {IExceptionFilter, ICleanInterceptor, IHandlerTransform} from "../contracts";

export class ApplicationConfig {
  private globalPrefix = '';
  private globalHandlers: IHandlerTransform[] = [];
  private globalFilters : IExceptionFilter[] = [];
  private globalInterceptors: ICleanInterceptor[] = [];
  private readonly globalRequestHandlers: InstanceWrapper<IHandlerTransform>[] = [];
  private readonly globalRequestFilters: InstanceWrapper<IExceptionFilter>[] = [];
  private readonly globalRequestInterceptors: InstanceWrapper<ICleanInterceptor>[] = [];

  public setGlobalPrefix(prefix: string) {
    this.globalPrefix = prefix;
  }

  public getGlobalPrefix() {
    return this.globalPrefix;
  }

  public addGlobalHandler(handler: IHandlerTransform<any>) {
    this.globalHandlers.push(handler);
  }

  public useGlobalHandler(...handlers: IHandlerTransform<any>[]) {
    this.globalHandlers = this.globalHandlers.concat(handlers);
  }

  public getGlobalFilters(): IExceptionFilter[] {
    return this.globalFilters;
  }

  public addGlobalFilter(filter: IExceptionFilter) {
    this.globalFilters.push(filter);
  }

  public useGlobalFilters(...filters: IExceptionFilter[]) {
    this.globalFilters = this.globalFilters.concat(filters);
  }

  public getGlobalHandlers(): IHandlerTransform<any>[] {
    return this.globalHandlers;
  }

  public getGlobalInterceptors(): ICleanInterceptor[] {
    return this.globalInterceptors;
  }

  public addGlobalInterceptor(interceptor: ICleanInterceptor) {
    this.globalInterceptors.push(interceptor);
  }

  public useGlobalInterceptors(...interceptors: ICleanInterceptor[]) {
    this.globalInterceptors = this.globalInterceptors.concat(interceptors);
  }

  public addGlobalRequestInterceptor(wrapper: InstanceWrapper<ICleanInterceptor>) {
    this.globalRequestInterceptors.push(wrapper);
  }

  public getGlobalRequestInterceptors(): InstanceWrapper<ICleanInterceptor>[] {
    return this.globalRequestInterceptors;
  }

  public addGlobalRequestHandler(wrapper: InstanceWrapper<IHandlerTransform>) {
    this.globalRequestHandlers.push(wrapper);
  }

  public getGlobalRequestHandler(): InstanceWrapper<IHandlerTransform>[] {
    return this.globalRequestHandlers;
  }

  public addGlobalRequestFilter(wrapper: InstanceWrapper<IExceptionFilter>) {
    this.globalRequestFilters.push(wrapper);
  }

  public getGlobalRequestFilters(): InstanceWrapper<IExceptionFilter>[] {
    return this.globalRequestFilters;
  }
}
