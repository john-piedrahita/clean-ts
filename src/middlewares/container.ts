import { SCOPE_OPTIONS_METADATA } from '../utils';
import { CleanContainer, InstanceWrapper } from '../ioc';
import {IMiddlewareConfiguration, Scope, Type} from "../contracts";

export class MiddlewareContainer {
  private readonly middleware = new Map<string, Map<string, InstanceWrapper>>();
  private readonly configurationSets = new Map<string, Set<IMiddlewareConfiguration>>();

  constructor(
      private readonly container: CleanContainer
  ) {}

  public getMiddlewareCollection(moduleKey: string,): Map<string, InstanceWrapper> {
    if (!this.middleware.has(moduleKey)) {
      const moduleRef = this.container.getModuleByKey(moduleKey);
      this.middleware.set(moduleKey, moduleRef.middlewares);
    }
    return this.middleware.get(moduleKey);
  }

  public getConfigurations(): Map<string, Set<IMiddlewareConfiguration>> {
    return this.configurationSets;
  }

  public insertConfig(configList: IMiddlewareConfiguration[], moduleKey: string) {
    const middleware = this.getMiddlewareCollection(moduleKey);
    const targetConfig = this.getTargetConfig(moduleKey);

    const configurations = configList || [];
    const insertMiddleware = <T extends Type<unknown>>(metaType: T) => {
      const token = metaType.name;
      middleware.set(
        token,
        new InstanceWrapper({
          scope: this.getClassScope(metaType),
          metaType,
          name: token,
        }),
      );
    };
    configurations.forEach(config => {
      [].concat(config.middleware).forEach(insertMiddleware);
      targetConfig.add(config);
    });
  }

  private getTargetConfig(moduleName: string) {
    if (!this.configurationSets.has(moduleName)) {
      this.configurationSets.set(moduleName, new Set<IMiddlewareConfiguration>());
    }
    return this.configurationSets.get(moduleName);
  }

  protected getClassScope<T = unknown>(type: Type<T>): Scope {
    const metadata = Reflect.getMetadata(SCOPE_OPTIONS_METADATA, type);
    return metadata && metadata.scope;
  }
}
