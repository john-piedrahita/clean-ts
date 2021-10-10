import { LoggerService, LogLevel } from '../services';

export interface ICleanApplicationContextOptions {

  logger?: LoggerService | LogLevel[] | boolean;

  abortOnError?: boolean;
}
