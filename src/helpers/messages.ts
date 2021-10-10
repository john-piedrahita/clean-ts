import { RequestMethod } from '../enums';

export const MISSING_REQUIRED_DEPENDENCY = (defaultPlatform: string, transport: string) =>
    `No driver (${transport}) has been selected. In order to take advantage of the default driver, please, ensure to install the "${defaultPlatform}" package ($ npm install ${defaultPlatform}).`;

export const ROUTE_MAPPED_MESSAGE = (path: string, method: string | number) =>
  `{${path}, ${RequestMethod[method]}} route`;
