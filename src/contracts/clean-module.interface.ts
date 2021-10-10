import { IMiddlewareConsumer } from './middleware-consumer.interface';

export interface ICleanModule {
  configure(consumer: IMiddlewareConsumer);
}
