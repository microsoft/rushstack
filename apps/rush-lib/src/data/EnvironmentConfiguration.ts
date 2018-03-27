// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const ENV_VALUE_PREFIX: string = 'rush_';

export enum EnvironmentValue {
  TempDirectoryOverride = 'rush_tempDir'
}

const NORMALIZED_ENV_VALUE_NAMES: { [lowercaseValue: string]: EnvironmentValue } = {};
for (const envValue in EnvironmentValue) {
  if (EnvironmentValue.hasOwnProperty(envValue)) {
    const enumValue: string = EnvironmentValue[envValue];
    NORMALIZED_ENV_VALUE_NAMES[enumValue.toLowerCase()] = enumValue as EnvironmentValue;
  }
}

export class EnvironmentConfiguration {
  private static _rushValues: Map<EnvironmentValue, string | undefined> =
    new Map<EnvironmentValue, string| undefined>();

  public static initialize(): void {
    EnvironmentConfiguration._rushValues.clear();

    const unknownEnvVariables: string[] = [];

    for (const envVar in process.env) {
      const normalizedEnvVar: string = envVar.toLowerCase(); // tslint:disable-line:forin
      if (process.env.hasOwnProperty(envVar) && normalizedEnvVar.indexOf(ENV_VALUE_PREFIX) === 0) {
        const resolvedValueName: EnvironmentValue | undefined = NORMALIZED_ENV_VALUE_NAMES[normalizedEnvVar];
        if (resolvedValueName) {
          EnvironmentConfiguration._rushValues.set(resolvedValueName, process.env[envVar]);
        } else {
          unknownEnvVariables.push(envVar);
        }
      }
    }

    if (unknownEnvVariables.length > 0) {
      throw new Error(`Unknown environment variables: ${unknownEnvVariables.join(', ')}`);
    }
  }

  public static getEnvironmentValue(envValue: EnvironmentValue): string | undefined {
    return EnvironmentConfiguration._rushValues.get(envValue);
  }
}
