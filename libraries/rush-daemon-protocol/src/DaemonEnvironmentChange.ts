// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The request's environment differs from the one that the daemon started with, in variables that the daemon cannot
 * take from each request. The daemon restarts with the request's environment.
 *
 * @beta
 */
export interface IDaemonEnvironmentChangedRestartReason {
  /** Identifies this reason. */
  readonly kind: 'environmentChanged';
  /**
   * The sorted names of the variables that differ: those that only one of the two environments sets, and those that
   * they set to different values. Values are never sent, because a variable such as `NODE_OPTIONS` can carry a
   * secret. Each control, format, line separator or paragraph separator character of a name, such as a newline, ESC,
   * U+2028 or a bidirectional override, and each backslash, is sent as an escape: `\xHH` below U+0100 and `\u{H…}`
   * from there on. So a client can print the names on one line. A daemon may send an empty list.
   */
  readonly variableNames: readonly string[];
}
