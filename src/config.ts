import { args } from './State';

const ENVIRONMENT_VARIABLE_PREFIX = 'GCB_';

let _defaultValues: Object = {};

export function setConfigDefaults(defaultValues: Object) {
  _defaultValues = defaultValues;
}

export function getConfigValue(name: string, defaultValue?: string | boolean): string | boolean {

  // Try to get config value from environment variable.
  let envVariable = ENVIRONMENT_VARIABLE_PREFIX + name.toUpperCase();
  let envValue = process.env[envVariable];
  let argsValue = args[name.toLowerCase()];

  return _firstDefinedValue(argsValue, envValue, defaultValue, _defaultValues[name]);
}

export function getFlagValue(name: string, defaultValue?: boolean): boolean {
  let configValue = getConfigValue(name, defaultValue);

  return configValue === 'true' || configValue === true;
}

function _firstDefinedValue(...args): any {
  for (let arg of args) {
    if (arg !== undefined) {
      return arg;
    }
  }

  return undefined;
}