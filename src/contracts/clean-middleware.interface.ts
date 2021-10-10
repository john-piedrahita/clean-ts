export interface ICleanMiddleware<T = any, R = any> {
  use(req: T, res: R, next: () => void): any;
}
