// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { args } from './State';
import { getConfig } from './index';

const ENVIRONMENT_VARIABLE_PREFIX: string = 'GCB_';

export function getConfigValue(name: string, defaultValue?: string | boolean): string | boolean {

  // Try to get config value from environment variable.
  const envVariable: string = ENVIRONMENT_VARIABLE_PREFIX + name.toUpperCase();
  const envValue: string | undefined = process.env[envVariable];
  const argsValue: string | boolean = args[name.toLowerCase()];

  // getConfig can be undefined during the first few calls to this function because the build config is initialized
  // before the getConfig function is defined. In those cases, a defaultValue is provided.
  const configValue: string | boolean = ((getConfig ? getConfig() : {}) || {})[name];

  return _firstDefinedValue(argsValue, envValue, defaultValue, configValue);
}

export function getFlagValue(name: string, defaultValue?: boolean): boolean {
  const configValue: string | boolean = getConfigValue(name, defaultValue);

  return configValue === 'true' || configValue === true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _firstDefinedValue(...values: (string | boolean | undefined)[]): any {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}