import { BadRequestError } from './error-types';

export function getOptionalParam<T extends object, K extends keyof T>(param: K, params: T, type: BaseType = 'string'): T[K] | undefined {
  if (!params.hasOwnProperty(param)) {
    return undefined;
  }
  if (typeof params[param] !== type) {
    throw new BadRequestError(`Expected type '${type}' for parameter: ${param}`);
  }
  return params[param];
}

export function getRequiredParam<T extends object, K extends keyof T>(param: K, params: T, type: BaseType = 'string'): T[K] {
  if (!params.hasOwnProperty(param)) {
    throw new BadRequestError(`Missing parameter: ${param}`);
  }
  if (typeof params[param] !== type) {
    throw new BadRequestError(`Expected type '${type}' for parameter: ${param}`);
  }
  return params[param];
}

export type BaseType = (
  'string' |
  'number' |
  'boolean' |
  'object' |
  'function' |
  'undefined'
);
