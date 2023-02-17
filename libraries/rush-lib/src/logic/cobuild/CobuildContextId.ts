// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConstants } from '../RushConstants';

export interface IGenerateCobuildContextIdOptions {
  environment: NodeJS.ProcessEnv;
}

/**
 * Calculates the cache entry id string for an operation.
 * @beta
 */
export type GetCobuildContextIdFunction = (options: IGenerateCobuildContextIdOptions) => string;

export class CobuildContextId {
  private constructor() {}

  public static parsePattern(pattern?: string): GetCobuildContextIdFunction {
    if (!pattern) {
      return () => '';
    } else {
      const resolvedPattern: string = pattern.trim();

      return (options: IGenerateCobuildContextIdOptions) => {
        const { environment } = options;
        return this._expandWithEnvironmentVariables(resolvedPattern, environment);
      };
    }
  }

  private static _expandWithEnvironmentVariables(pattern: string, environment: NodeJS.ProcessEnv): string {
    const missingEnvironmentVariables: Set<string> = new Set<string>();
    const expandedPattern: string = pattern.replace(
      /\$\{([^\}]+)\}/g,
      (match: string, variableName: string): string => {
        const variable: string | undefined =
          variableName in environment ? environment[variableName] : undefined;
        if (variable !== undefined) {
          return variable;
        } else {
          missingEnvironmentVariables.add(variableName);
          return match;
        }
      }
    );
    if (missingEnvironmentVariables.size) {
      throw new Error(
        `The "cobuildContextIdPattern" value in ${
          RushConstants.cobuildFilename
        } contains missing environment variable${
          missingEnvironmentVariables.size > 1 ? 's' : ''
        }: ${Array.from(missingEnvironmentVariables).join(', ')}`
      );
    }

    return expandedPattern;
  }
}
