import {RouteParamTypes} from '../enums';
import {ParamsTokenFactory} from './params-token-factory';
import {IArgumentMetadata, IHandlerTransform} from "../contracts";

export class HandlersConsumer {

  private readonly paramsTokenFactory = new ParamsTokenFactory();

  public async apply<T = unknown>(value: T, { metaType, type, data }: IArgumentMetadata, pipes: IHandlerTransform[]) {
    const token = this.paramsTokenFactory.exchangeEnumForString((type as any) as RouteParamTypes);
    return this.applyHandlers(value, { metaType, type: token, data }, pipes);
  }

  public async applyHandlers<T = unknown>(value: T, { metaType, type, data }: { metaType: any; type?: any; data?: any }, transforms: IHandlerTransform[],) {
    return transforms.reduce(async (deferredValue, pipe) => {
      const val = await deferredValue;
      return pipe.transform(val, {metaType, type, data});
    }, Promise.resolve(value));
  }
}
