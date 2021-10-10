export interface IResolver {
  resolve(instance: any, basePath: string): void;
  registerNotFoundHandler(): void;
  registerExceptionHandler(): void;
}
