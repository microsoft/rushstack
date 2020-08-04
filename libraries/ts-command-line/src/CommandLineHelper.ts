// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineConstants } from './Constants';

/**
 * Helpers for working with the ts-command-line API.
 *
 * @public
 */
export class CommandLineHelper {
  /**
   * Returns true if the current command line action is tab-complete.
   *
   * @public
   */
  public static isTabCompletionActionRequest(): boolean {
    return process.argv.length > 2 && process.argv[2] === CommandLineConstants.TabCompletionActionName;
  }
}
