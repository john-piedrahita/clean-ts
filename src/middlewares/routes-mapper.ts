import {
  addLeadingSlash,
  isString,
  isUndefined,
  PATH_METADATA
} from '../utils';
import {RequestMethod} from "../enums";
import { CleanContainer } from '../ioc';
import { MetadataScanner } from '../app';
import { RouterExplorer } from '../routers';
import {IRouteInfo, Type} from "../contracts";


export class RoutesMapper {
  private readonly routerExplorer: RouterExplorer;

  constructor(container: CleanContainer) {
    this.routerExplorer = new RouterExplorer(new MetadataScanner(), container);
  }

  public mapRouteToRouteInfo(route: Type<any> | IRouteInfo | string): IRouteInfo[] {
    if (isString(route)) return [{ path: this.validateRoutePath(route), method: RequestMethod.ALL } ];

    const routePathOrPaths: string | string[] = Reflect.getMetadata(PATH_METADATA, route);
    if (this.isRouteInfo(routePathOrPaths, route)) return [{ path: this.validateRoutePath(route.path), method: route.method }];

    const paths = this.routerExplorer.scanForPaths(Object.create(route), route.prototype);
    const concatPaths = <T>(acc: T[], currentValue: T[]) => acc.concat(currentValue);

    return []
      .concat(routePathOrPaths)
      .map(routePath =>
        paths
          .map(
            item =>
              item.path &&
              item.path.map(p => ({
                path:
                  this.validateGlobalPath(routePath) +
                  this.validateRoutePath(p),
                method: item.requestMethod,
              })),
          )
          .reduce(concatPaths, []),
      )
      .reduce(concatPaths, []);
  }

  protected isRouteInfo(path: string | string[] | undefined, objectOrClass: Function | IRouteInfo): objectOrClass is IRouteInfo {
    return isUndefined(path);
  }

  protected validateGlobalPath(path: string): string {
    const prefix = addLeadingSlash(path);
    return prefix === '/' ? '' : prefix;
  }

  protected validateRoutePath(path: string): string {
    return addLeadingSlash(path);
  }
}
