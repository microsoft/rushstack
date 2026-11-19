// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEnvironmentChangedRestartReason } from './DaemonEnvironmentChange';
import type { IDaemonWorkspaceInputsChangedRestartReason } from './DaemonWorkspaceInputsChange';

/**
 * How a folder of a running daemon's installation changed after the daemon started.
 *
 * @beta
 */
export type DaemonInstallationChangeKind = 'removed' | 'replaced';

/**
 * A folder of the daemon's own installation, or of the Rush engine that it loaded, that was removed or replaced
 * after the daemon started. Such a daemon cannot load the rest of its code, so it restarts instead of serving.
 *
 * @beta
 */
export interface IDaemonInstallationChange {
  /** `removed` when the folder no longer exists; `replaced` when a different folder now has its path. */
  readonly change: DaemonInstallationChangeKind;
  /** The absolute path of the outermost folder that was removed or replaced. */
  readonly folder: string;
}

/**
 * The daemon's installation was removed or replaced. The daemon exits without selecting a successor, and the
 * client starts one with its own current launcher.
 *
 * @beta
 */
export interface IDaemonInstallationChangedRestartReason extends IDaemonInstallationChange {
  /** Identifies this reason. */
  readonly kind: 'installationChanged';
}

/**
 * Another request runs a native Rush command that changes the workspace's installation, such as `install` or
 * `update`, and the daemon restarts once it has run. A queued request that waits behind that request is told this
 * reason, with `restartsForAnotherRequest`.
 *
 * @beta
 */
export interface IDaemonNativeMutationRestartReason {
  /** Identifies this reason. */
  readonly kind: 'nativeMutation';
  /** The name of the Rush command that the other request runs, such as `install`. */
  readonly commandName: string;
}

/**
 * Why a daemon asked the client to retry after a restart, or why a queued request waits for a restart. Clients ignore
 * kinds that they do not know.
 *
 * @beta
 */
export type DaemonRestartReason =
  | IDaemonInstallationChangedRestartReason
  | IDaemonEnvironmentChangedRestartReason
  | IDaemonWorkspaceInputsChangedRestartReason
  | IDaemonNativeMutationRestartReason;
