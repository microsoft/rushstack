// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

enum EnvironmentVariableNames {
  TempFolderOverride = 'RUSH_TEMP_FOLDER'
}

const NORMALIZED_ENV_VALUE_NAMES: { [uppercaseValue: string]: EnvironmentVariableNames } = {};
for (const envValue in EnvironmentVariableNames) {
  if (EnvironmentVariableNames.hasOwnProperty(envValue)) {
    const enumValue: string = EnvironmentVariableNames[envValue];
    NORMALIZED_ENV_VALUE_NAMES[enumValue.toUpperCase()] = enumValue as EnvironmentVariableNames;
  }
}

/**
 * Provides Rush-specific environment variable data. All Rush environment variables must start with "RUSH_". This class
 * is designed to be used by RushConfiguration.
 *
 * @remarks
 * Initialize will throw if any unknown parameters are present.
 */
export class EnvironmentConfiguration {
  private static _hasBeenInitialized: boolean = false;

  private static _rushTempFolderOverride: string | undefined;

  /**
   * An override for the common/temp folder path.
   */
  public static get rushTempFolderOverride(): string | undefined {
    EnvironmentConfiguration._ensureInitialized();
    return EnvironmentConfiguration._rushTempFolderOverride;
  }

  /**
   * Reads and validates environment variables. If any are invalid, this function will throw.
   */
  public static initialize(): void {
    EnvironmentConfiguration.reset();

    const unknownEnvVariables: string[] = [];
    for (const envVar in process.env) {
      if (process.env.hasOwnProperty(envVar) && envVar.match(/^RUSH_/i)) {
        const resolvedValueName: EnvironmentVariableNames | undefined = NORMALIZED_ENV_VALUE_NAMES[envVar];
        const value: string | undefined = process.env[envVar];
        switch (resolvedValueName) {
          case EnvironmentVariableNames.TempFolderOverride:
            EnvironmentConfiguration._rushTempFolderOverride = value;
            break;

          default:
            unknownEnvVariables.push(envVar);
            break;
        }
      }
    }

    // This strictness intends to catch mistakes where variables are misspelled or not used correctly.
    if (unknownEnvVariables.length > 0) {
      throw new Error(
        'The following environment variables were found with the "RUSH_" prefix, but they are not ' +
        `recognized by this version of Rush: ${unknownEnvVariables.join(', ')}`
      );
    }

    EnvironmentConfiguration._hasBeenInitialized = true;
  }

  /**
   * Resets EnvironmentConfiguration into an un-initialized state.
   */
  public static reset(): void {
    EnvironmentConfiguration._rushTempFolderOverride = undefined;

    EnvironmentConfiguration._hasBeenInitialized = false;
  }

  private static _ensureInitialized(): void {
    if (!EnvironmentConfiguration._hasBeenInitialized) {
      throw new Error('The EnvironmentConfiguration must be initialized before values can be accessed.');
    }
  }
}
