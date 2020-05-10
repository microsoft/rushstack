// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as isCI from 'is-ci';
import * as colors from 'colors';

/**
 * Determines if Rush is running in CI mode or NON-CI mode
 */
export class RushCiMode {

  private static _rushCiMode: RushCiMode;

  private readonly _forceCI: boolean;
  private readonly _forceNONCI: boolean;

  private static _initialized: boolean;

  private constructor(overrideMode: string | undefined) {
    this._forceCI = false;
    this._forceNONCI = false;
    if (!overrideMode) {
      // Nothing to do.
      return;
    }

    if (overrideMode === 'CI') {
      console.log(colors.yellow('WARNING: Rush mode overriden to: ' + overrideMode));
      this._forceCI = true;
    } else if (overrideMode === 'NON-CI') {
      console.log(colors.yellow('WARNING: Rush mode overriden to: ' + overrideMode));
      this._forceNONCI = true;
    } else {
      console.log(colors.yellow('WARNING: Ignoring unknown Rush mode override string: ' + overrideMode));
    }
  }

  /**
   * Initializes the Rush execution mode.
   * @param overrideMode
   *   Set to 'CI' to force the mode to CI.
   *   Set to 'NON-CI' to force the mode to NON-CI.
   *   Set to anything else (or undefined) to use value returned by is-ci.
   */
  public static initialize(overrideMode: string | undefined): void {
    if (RushCiMode._initialized) {
      console.log(colors.yellow('WARNING: Rush execution mode reinitialized.'));
      console.log(colors.yellow('Previous execution mode: ' + (RushCiMode.isCI() ? 'CI' : 'NON-CI')));
    }

    RushCiMode._initialized = true;
    RushCiMode._rushCiMode = new RushCiMode(overrideMode);
    console.log(colors.yellow('Rush is running in ' + (RushCiMode.isCI() ? 'CI' : 'NON-CI') + ' mode.'));
    console.log();
  }

  /**
   * Returns true if rush is running on a CI.
   *
   * The package is-ci is to detect this.
   * Set environment variable RUSH_CI_MODE to override:
   *   To force CI mode, set the environment variable to CI
   *   To force non-CI mode, set the environment variable to NON-CI
   */
  public static isCI(): boolean {
    if (!RushCiMode._initialized) {
      RushCiMode.initialize(undefined);
    }

    if (RushCiMode._rushCiMode._forceCI) {
      return true;
    }

    if (RushCiMode._rushCiMode._forceNONCI) {
      return false;
    }

    return isCI;
  }
}