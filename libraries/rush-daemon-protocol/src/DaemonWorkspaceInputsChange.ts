// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Workspace inputs that bind a daemon process differ from the ones that it started with, so the daemon restarts to
 * serve a request that needs them. Each field is set only when that kind of input differs, and a list is empty when
 * the daemon could not tell which files changed. A request whose environment differs is described by
 * `environmentChanged` instead, whatever else differs.
 *
 * @beta
 */
export interface IDaemonWorkspaceInputsChangedRestartReason {
  /** Identifies this reason. */
  readonly kind: 'workspaceInputsChanged';
  /**
   * The installation files that changed since the daemon started, such as the lockfile, relative to the workspace
   * root when they are inside it.
   */
  readonly installationFiles?: ReadonlyArray<string>;
  /**
   * Some of the files of Rush or of a Rush plugin whose code changed since the daemon started, relative to the
   * workspace root when they are inside it.
   */
  readonly implementationFiles?: ReadonlyArray<string>;
  /** The Rush version that the request selects, which the daemon does not run. */
  readonly selectedRushVersion?: string;
}
