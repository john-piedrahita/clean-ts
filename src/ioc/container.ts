import { Module } from './module';
import { REQUEST } from '../routers';
import { ApplicationConfig } from '../app';
import { ModuleCompiler } from './compiler';
import { IContextId } from './instance-wrapper';
import { GLOBAL_MODULE_METADATA } from '../utils';
import { ModulesContainer } from './modules-container';
import { ModuleTokenFactory } from './module-token-factory';
import { InternalCoreModule } from './internal-core-module';
import { ExternalContextCreator, HttpAdapterHost } from '../helpers';
import { InternalProvidersStorage } from './internal-providers-storage';
import {IDynamicModule, InjectableInterface, Provider, Type} from "../contracts";
import { CircularDependencyException, UndefinedForwardRefException, UnknownModuleException } from '../exceptions';

export class CleanContainer {

  private readonly globalModules = new Set<Module>();
  private readonly moduleTokenFactory = new ModuleTokenFactory();
  private readonly moduleCompiler = new ModuleCompiler(this.moduleTokenFactory);
  private readonly modules = new ModulesContainer();
  private readonly dynamicModulesMetadata = new Map<string, Partial<IDynamicModule>>();
  private readonly internalProvidersStorage = new InternalProvidersStorage();
  private internalCoreModule: Module;

  constructor(
    private readonly _applicationConfig: ApplicationConfig = undefined,
  ) {}

  get applicationConfig(): ApplicationConfig | undefined {
    return this._applicationConfig;
  }

  public setHttpAdapter(httpAdapter: any) {
    this.internalProvidersStorage.httpAdapter = httpAdapter;

    if (!this.internalProvidersStorage.httpAdapterHost) {
      return;
    }
    const host = this.internalProvidersStorage.httpAdapterHost;
    host.httpAdapter = httpAdapter;
  }

  public getHttpAdapterRef() {
    return this.internalProvidersStorage.httpAdapter;
  }

  public async addModule(metaType: Type<any> | IDynamicModule | Promise<IDynamicModule>, scope: Type<any>[]): Promise<Module> {

    if (!metaType) throw new UndefinedForwardRefException(scope);

    const { type, dynamicMetadata, token } = await this.moduleCompiler.compile(metaType);
    if (this.modules.has(token)) return;

    const moduleRef = new Module(type, this);
    this.modules.set(token, moduleRef);

    await this.addDynamicMetadata(token, dynamicMetadata, [].concat(scope, type));

    if (this.isGlobalModule(type, dynamicMetadata)) this.addGlobalModule(moduleRef);

    return moduleRef;
  }

  public async addDynamicMetadata(token: string, dynamicModuleMetadata: Partial<IDynamicModule>, scope: Type<any>[]) {
    if (!dynamicModuleMetadata) return;

    this.dynamicModulesMetadata.set(token, dynamicModuleMetadata);
    const { imports } = dynamicModuleMetadata;
    await this.addDynamicModules(imports, scope);
  }

  public async addDynamicModules(modules: any[], scope: Type<any>[]) {
    if (!modules) return;
    await Promise.all(modules.map(module => this.addModule(module, scope)));
  }

  public isGlobalModule(metaType: Type<any>, dynamicMetadata?: Partial<IDynamicModule>): boolean {
    if (dynamicMetadata && dynamicMetadata.global) return true;
    return !!Reflect.getMetadata(GLOBAL_MODULE_METADATA, metaType);
  }

  public addGlobalModule(module: Module) {
    this.globalModules.add(module);
  }

  public getModules(): ModulesContainer {
    return this.modules;
  }

  public getModuleByKey(moduleKey: string): Module {
    return this.modules.get(moduleKey);
  }

  public async addImport(relatedModule: Type<any> | IDynamicModule, token: string) {
    if (!this.modules.has(token)) return;
    const moduleRef = this.modules.get(token);
    const { token: relatedModuleToken } = await this.moduleCompiler.compile(relatedModule);
    const related = this.modules.get(relatedModuleToken);
    moduleRef.addRelatedModule(related);
  }

  public addProvider(provider: Provider, token: string): string {
    if (!provider) throw new CircularDependencyException();

    if (!this.modules.has(token)) throw new UnknownModuleException();
    const moduleRef = this.modules.get(token);
    return moduleRef.addProvider(provider);
  }

  public addAdapter(adapter: Provider, token: string): string {
    if (!adapter) throw new CircularDependencyException();

    if (!this.modules.has(token)) throw new UnknownModuleException();

    const moduleRef = this.modules.get(token);
    return moduleRef.addAdapter(adapter);
  }

  public addInjectable(injectable: Provider, token: string, host?: Type<InjectableInterface>) {
    if (!this.modules.has(token)) throw new UnknownModuleException();

    const moduleRef = this.modules.get(token);
    moduleRef.addInjectable(injectable, host);
  }

  public addExportedProvider(provider: Type<any>, token: string) {
    if (!this.modules.has(token)) throw new UnknownModuleException();
    const moduleRef = this.modules.get(token);
    moduleRef.addExportedProvider(provider);
  }

  public addController(controller: Type<any>, token: string) {
    if (!this.modules.has(token)) throw new UnknownModuleException();
    const moduleRef = this.modules.get(token);
    moduleRef.addController(controller);
  }

  public replace(toReplace: string | symbol, options: string | symbol & { scope: string[] | null }) {
    this.modules.forEach(moduleRef => moduleRef.replace(toReplace, options));
  }

  public bindGlobalScope() {
    this.modules.forEach(moduleRef => this.bindGlobalsToImports(moduleRef));
  }

  public bindGlobalsToImports(moduleRef: Module) {
    this.globalModules.forEach(globalModule => this.bindGlobalModuleToModule(moduleRef, globalModule));
  }

  public bindGlobalModuleToModule(target: Module, globalModule: Module) {
    if (target === globalModule || target === this.internalCoreModule) return;
    target.addRelatedModule(globalModule);
  }

  public getDynamicMetadataByToken(token: string, metadataKey: keyof IDynamicModule) {
    const metadata = this.dynamicModulesMetadata.get(token);
    if (metadata && metadata[metadataKey]) return metadata[metadataKey] as any[];
    return [];
  }

  public createCoreModule(): IDynamicModule {
    return InternalCoreModule.register([
      {
        provide: ExternalContextCreator,
        useValue: ExternalContextCreator.fromContainer(this),
      },
      {
        provide: ModulesContainer,
        useValue: this.modules,
      },
      {
        provide: HttpAdapterHost,
        useValue: this.internalProvidersStorage.httpAdapterHost,
      },
    ]);
  }

  public registerCoreModuleRef(moduleRef: Module) {
    this.internalCoreModule = moduleRef;
    this.modules[InternalCoreModule.name] = moduleRef;
  }

  public getModuleTokenFactory(): ModuleTokenFactory {
    return this.moduleTokenFactory;
  }

  public registerRequestProvider<T = any>(request: T, contextId: IContextId) {
    const wrapper = this.internalCoreModule.getProviderByKey(REQUEST);
    wrapper.setInstanceByContextId(contextId, {
      instance: request,
      isResolved: true,
    });
  }
}
