import { iterate } from 'iterare';

import {
  IHttpServer,
  IMiddlewareConfigProxy,
  IMiddlewareConfiguration,
  IMiddlewareConsumer,
  IRouteInfo,
  Type
} from "../contracts";
import {flatten} from "../utils";
import { filterMiddleware } from './utils';
import { RoutesMapper } from './routes-mapper';

export class MiddlewareBuilder implements IMiddlewareConsumer {
  private readonly middlewareCollection = new Set<IMiddlewareConfiguration>();

  constructor(
    private readonly routesMapper: RoutesMapper,
    private readonly httpAdapter: IHttpServer,
  ) {}

  public apply(...middleware: Array<Type<any> | Function | any>): IMiddlewareConfigProxy {
    return new MiddlewareBuilder.ConfigProxy(this, flatten(middleware));
  }

  public build(): IMiddlewareConfiguration[] {
    return [...this.middlewareCollection];
  }

  public getHttpAdapter(): IHttpServer {
    return this.httpAdapter;
  }

  private static readonly ConfigProxy = class implements IMiddlewareConfigProxy {
    private excludedRoutes: IRouteInfo[] = [];

    constructor(
      private readonly builder: MiddlewareBuilder,
      private readonly middleware: Array<Type<any> | Function | any>,
    ) {}

    public getExcludedRoutes(): IRouteInfo[] {
      return this.excludedRoutes;
    }

    public exclude(...routes: Array<string | IRouteInfo>): IMiddlewareConfigProxy {
      this.excludedRoutes = this.getRoutesFlatList(routes);
      return this;
    }

    public forRoutes(...routes: Array<string | Type<any> | IRouteInfo>): IMiddlewareConsumer {
      const { middlewareCollection } = this.builder;

      const forRoutes = this.getRoutesFlatList(routes);
      const configuration = {
        middleware: filterMiddleware(this.middleware, this.excludedRoutes, this.builder.getHttpAdapter()),
        forRoutes,
      };
      middlewareCollection.add(configuration);
      return this.builder;
    }

    private getRoutesFlatList(routes: Array<string | Type<any> | IRouteInfo>): IRouteInfo[] {
      const { routesMapper } = this.builder;

      return iterate(routes)
        .map(route => routesMapper.mapRouteToRouteInfo(route))
        .flatten()
        .toArray();
    }
  };
}
