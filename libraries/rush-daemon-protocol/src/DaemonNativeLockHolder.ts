// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A Rush process that the daemon does not run, such as `rush install`, which holds the repository's lock, as far as
 * the daemon can tell.
 * @beta
 */
export interface IDaemonNativeLockHolder {
  /** The process ID of the holder. Omitted when the lock does not name it, as on Windows. */
  readonly pid?: number;
  /** The holder's command, shortened to the program and its action, such as `rush install`. Omitted when unknown. */
  readonly command?: string;
}
