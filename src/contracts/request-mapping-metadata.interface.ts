import {RequestMethod} from "../enums";

export interface IRequestMappingMetadata {
    path?: string | string[];
    method?: RequestMethod;
}