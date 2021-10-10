import { Module } from './module';
import { Injector } from './injector';
import { CleanContainer } from './container';
import { InternalCoreModule } from './internal-core-module';
import {Controller, InjectableInterface} from "../contracts";

export class InstanceLoader {

  private readonly injector = new Injector();

  constructor(private readonly container: CleanContainer) {}

  public async createInstancesOfDependencies() {
    const modules = this.container.getModules();
    this.createPrototypes(modules);
    await this.createInstances(modules);
  }

  private createPrototypes(modules: Map<string, Module>) {
    modules.forEach(module => {
      this.createPrototypesOfProviders(module);
      this.createPrototypesOfAdapters(module);
      this.createPrototypesOfInjectables(module);
      this.createPrototypesOfControllers(module);
    });
  }

  private async createInstances(modules: Map<string, Module>) {
    await Promise.all(
      [...modules.values()].map(async module => {
        await this.createInstancesOfProviders(module);
        await this.createInstancesOfAdapters(module);
        await this.createInstancesOfInjectables(module);
        await this.createInstancesOfControllers(module);

        const { name } = module.metaType;
        this.isModuleWhitelisted(name);
      }),
    );
  }

  private createPrototypesOfProviders(module: Module) {
    const { providers } = module;
    providers.forEach(wrapper => this.injector.loadPrototype<InjectableInterface>(wrapper, providers));
  }

  private async createInstancesOfProviders(module: Module) {
    const { providers } = module;
    const wrappers = [...providers.values()];
    await Promise.all(wrappers.map(item => this.injector.loadProvider(item, module)));
  }

  private createPrototypesOfAdapters(module: Module) {
    const { adapters } = module;
    adapters.forEach(wrapper => this.injector.loadPrototype<InjectableInterface>(wrapper, adapters));
  }

  private async createInstancesOfAdapters(module: Module) {
    const { adapters } = module;
    const wrappers = [...adapters.values()];
    await Promise.all(wrappers.map(item => this.injector.loadAdapter(item, module)));
  }

  private createPrototypesOfControllers(module: Module) {
    const { controllers } = module;
    controllers.forEach(wrapper => this.injector.loadPrototype<Controller>(wrapper, controllers));
  }

  private async createInstancesOfControllers(module: Module) {
    const { controllers } = module;
    const wrappers = [...controllers.values()];
    await Promise.all(wrappers.map(item => this.injector.loadController(item, module)));
  }

  private createPrototypesOfInjectables(module: Module) {
    const { injectables } = module;
    injectables.forEach(wrapper => this.injector.loadPrototype(wrapper, injectables));
  }

  private async createInstancesOfInjectables(module: Module) {
    const { injectables } = module;
    const wrappers = [...injectables.values()];
    await Promise.all(wrappers.map(item => this.injector.loadInjectable(item, module)));
  }

  protected isModuleWhitelisted(name: string): boolean {
    return name !== InternalCoreModule.name;
  }
}
