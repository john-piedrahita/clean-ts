import {IAbstract, IDynamicModule, ICleanApplicationContext, Scope, Type} from "../contracts";
import {IContextId, Injector, InstanceLinksHost, Module, ModuleCompiler, CleanContainer} from "../ioc";
import {InvalidClassScopeException, UnknownElementException, UnknownModuleException} from "../exceptions";
import {createContextId} from "../helpers";
import {Logger, LoggerService, LogLevel} from "../services";

type GetType = Type<any> | IAbstract<any> | string | symbol

export class CleanApplicationContext implements ICleanApplicationContext {
  protected isInitialized = false;
  protected readonly injector = new Injector();

  private readonly moduleCompiler = new ModuleCompiler();
  private _instanceLinksHost: InstanceLinksHost;

  private get instanceLinksHost() {
    if (!this._instanceLinksHost) {
      this._instanceLinksHost = new InstanceLinksHost(this.container);
    }
    return this._instanceLinksHost;
  }

  constructor(
    protected readonly container: CleanContainer,
    private readonly scope = new Array<Type<any>>(),
    private contextModule: Module = null,
  ) {}

  public selectContextModule() {
    const modules = this.container.getModules().values();
    this.contextModule = modules.next().value;
  }

  public select<T>(moduleType: Type<T> | IDynamicModule): ICleanApplicationContext {
    const modulesContainer = this.container.getModules();
    const contextModuleCtor = this.contextModule.metaType;
    const scope = this.scope.concat(contextModuleCtor);

    const moduleTokenFactory = this.container.getModuleTokenFactory();
    const { type, dynamicMetadata } = this.moduleCompiler.extractMetadata(moduleType);
    const token = moduleTokenFactory.create(type, dynamicMetadata);

    const selectedModule = modulesContainer.get(token);
    if (!selectedModule) throw new UnknownModuleException();

    return new CleanApplicationContext(this.container, scope, selectedModule);
  }


  public get<T = any, R = T>(typeOrToken: GetType, options: { strict: boolean } = { strict: false }): R {
    return !(options && options.strict) ? this.find<T, R>(typeOrToken) : this.find<T, R>(typeOrToken, this.contextModule);
  }

  public resolve<T = any, R = T>(typeOrToken: GetType, contextId = createContextId(), options: { strict: boolean } = { strict: false }): Promise<R> {
    return this.resolvePerContext(typeOrToken, this.contextModule, contextId, options);
  }

  public registerRequestByContextId<T = any>(request: T, contextId: IContextId) {
    this.container.registerRequestProvider(request, contextId);
  }

  public async init(): Promise<this> {
    if (this.isInitialized) return this;
    this.isInitialized = true;
    return this;
  }

  public async close(): Promise<void> {
    await this.dispose();
  }

  public useLogger(logger: LoggerService | LogLevel[] | false) {
    Logger.overrideLogger(logger);
  }

  protected async dispose(): Promise<void> {
    return Promise.resolve();
  }

  protected find<T = any, R = T>(typeOrToken: GetType, contextModule?: Module): R {
    const moduleId = contextModule && contextModule.id;
    const { wrapperRef } = this.instanceLinksHost.get<R>(typeOrToken, moduleId);
    if (wrapperRef.scope === Scope.REQUEST || wrapperRef.scope === Scope.TRANSIENT) {
      throw new InvalidClassScopeException(typeOrToken);
    }
    return wrapperRef.instance;
  }

  protected async resolvePerContext<T = any, R = T>(typeOrToken:  GetType, contextModule: Module, contextId: IContextId, options?: { strict: boolean }): Promise<R> {
    const isStrictModeEnabled = options && options.strict;
    const instanceLink = isStrictModeEnabled
      ? this.instanceLinksHost.get(typeOrToken, contextModule.id) : this.instanceLinksHost.get(typeOrToken);

    const { wrapperRef, collection } = instanceLink;
    if (wrapperRef.isDependencyTreeStatic() && !wrapperRef.isTransient) return this.get(typeOrToken);

    const ctorHost = wrapperRef.instance || { constructor: typeOrToken };
    const instance = await this.injector.loadPerContext(ctorHost, wrapperRef.host, collection, contextId);
    if (!instance) throw new UnknownElementException();

    return instance;
  }
}
