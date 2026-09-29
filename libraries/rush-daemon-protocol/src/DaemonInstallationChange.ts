// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

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
 * Why a daemon asked the client to retry after a restart. Clients ignore kinds that they do not know.
 *
 * @beta
 */
export type DaemonRestartReason = IDaemonInstallationChangedRestartReason;
