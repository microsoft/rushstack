// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IProblemMatcher } from './ProblemMatcher';

/**
 * Options for {@link ProblemMatcherRegistry.getMatchers}.
 *
 * @beta
 */
export interface IGetMatchersOptions {
  /**
   * The tool version, used to scope matchers.
   */
  readonly version?: string;

  /**
   * Whether to include matchers that are not enabled by default.
   */
  readonly includeDisabled?: boolean;
}

/**
 * A registry of tool- and version-scoped problem matchers.
 *
 * @remarks
 * By default only matchers enabled after corpus validation are returned. Older
 * Heft versions are routed through this path by registering matchers whose
 * version predicate covers them.
 *
 * @beta
 */
export class ProblemMatcherRegistry {
  private readonly _matchers: IProblemMatcher[] = [];

  /**
   * Registers a matcher.
   */
  public register(matcher: IProblemMatcher): void {
    this._matchers.push(matcher);
  }

  /**
   * Returns the matchers that apply to a tool and version.
   */
  public getMatchers(tool: string, options: IGetMatchersOptions = {}): IProblemMatcher[] {
    return this._matchers.filter((matcher: IProblemMatcher) => {
      if (matcher.tool !== tool) {
        return false;
      }
      if (!options.includeDisabled && !matcher.enabledByDefault) {
        return false;
      }
      if (
        options.version !== undefined &&
        matcher.matchesVersion !== undefined &&
        !matcher.matchesVersion(options.version)
      ) {
        return false;
      }
      return true;
    });
  }
}
