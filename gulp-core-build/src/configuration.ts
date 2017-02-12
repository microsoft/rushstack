import { args } from './State';

const ENVIRONMENT_VARIABLE_PREFIX: string = 'GCB_';

let _defaultValues: Object = {};

export function setConfigurationDefaults(defaultValues: Object): void {
  _defaultValues = defaultValues;
}

export function getConfigurationValue(name: string, defaultValue?: string | boolean): string | boolean {

  // Try to get configuration value from environment variable.
  const envVariable: string = ENVIRONMENT_VARIABLE_PREFIX + name.toUpperCase();
  const envValue: string = process.env[envVariable];
  const argsValue: string | boolean = args[name.toLowerCase()];

  return _firstDefinedValue(argsValue, envValue, defaultValue, _defaultValues[name]);
}

export function getFlagValue(name: string, defaultValue?: boolean): boolean {
  const configurationValue: string | boolean = getConfigurationValue(name, defaultValue);

  return configurationValue === 'true' || configurationValue === true;
}

/* tslint:disable:no-any */
function _firstDefinedValue(...args: (string | boolean)[]): any {
/* tslint:enable:no-any */
  for (const arg of args) {
    if (arg !== undefined) {
      return arg;
    }
  }

  return undefined;
}