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

/**
 * Provides Rush-specific environment variable data. All Rush environment variables must start with "rush_". This class
 * is designed to be used by RushConfiguration.
 *
 * @remarks
 * Initialize will throw if any unknown parameters are present.
 */
export class EnvironmentConfiguration {
  private static _rushValues: Map<EnvironmentValue, string | undefined> =
    new Map<EnvironmentValue, string| undefined>();
  private static _hasBeenInitialized: boolean = false;

  /**
   * Reads and validates environment variables. If any are invalid, this function will throw.
   */
  public static initialize(): void {
    EnvironmentConfiguration.reset();

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

    EnvironmentConfiguration._hasBeenInitialized = true;
  }

  /**
   * Resets EnvironmentConfiguration into an un-initialized state.
   */
  public static reset(): void {
    EnvironmentConfiguration._rushValues.clear();
    EnvironmentConfiguration._hasBeenInitialized = false;
  }

  /**
   * Gets the value of a rush environment variable. Throws if EnvironmentConfiguration has not be initialized.
   */
  public static getEnvironmentValue(envValue: EnvironmentValue): string | undefined {
    if (!EnvironmentConfiguration._hasBeenInitialized) {
      throw new Error('The EnvironmentConfiguration must be initialized before values can be accessed.');
    }

    return EnvironmentConfiguration._rushValues.get(envValue);
  }
}
