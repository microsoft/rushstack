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
   * secret. A daemon may send an empty list.
   */
  readonly variableNames: readonly string[];
}
