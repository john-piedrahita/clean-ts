import { ModuleTokenFactory } from './module-token-factory';
import {IDynamicModule, ModuleFactory, Type} from "../contracts";

export class ModuleCompiler {
  constructor(private readonly moduleTokenFactory = new ModuleTokenFactory()) {}

  public async compile(metaType: Type<any> | IDynamicModule | Promise<IDynamicModule>): Promise<ModuleFactory> {
    const { type, dynamicMetadata } = this.extractMetadata(await metaType);
    const token = this.moduleTokenFactory.create(type, dynamicMetadata);
    return { type, dynamicMetadata, token };
  }

  public extractMetadata(metaType: Type<any> | IDynamicModule): { type: Type<any>; dynamicMetadata?: Partial<IDynamicModule> } {
    if (!this.isDynamicModule(metaType)) return { type: metaType };
    const { module: type, ...dynamicMetadata } = metaType;
    return { type, dynamicMetadata };
  }

  public isDynamicModule(module: Type<any> | IDynamicModule): module is IDynamicModule {
    return !!(module as IDynamicModule).module;
  }
}
