import {
  CorsOptions,
  CorsOptionsDelegate,
} from './cors-options.interface';
import { HttpsOptions } from './https-options.interface';
import { ICleanApplicationContextOptions } from './clean-application-context-options.interface';

export interface ICleanApplicationOptions extends ICleanApplicationContextOptions {

  cors?: boolean | CorsOptions | CorsOptionsDelegate<any>;

  bodyParser?: boolean;

  httpsOptions?: HttpsOptions;
}
