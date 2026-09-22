// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonVerbosity } from './DaemonVerbosity';

/**
 * Terminal capabilities and verbosity requested by one client subscription.
 *
 * @remarks
 * Carried in the request envelope; the daemon applies `verbosity` as a
 * per-subscription serialization filter and threads `columns`/`colorLevel`
 * into child process environments (`FORCE_COLOR`/`COLUMNS`) for TTY clients.
 *
 * @beta
 */
export interface IDaemonClientCaps {
  /** Whether the client's output is an interactive TTY. */
  readonly isTTY: boolean;
  /** Whether the client supports request-scoped stdin and acknowledged raw-mode control. */
  readonly supportsInteractiveIO?: boolean;
  /** Whether the client supports request admission progress controls and typed failures. */
  readonly supportsRequestAdmission?: boolean;
  /** Whether the client supports the request start, cancellation, and terminal outcome controls. */
  readonly supportsRequestLifecycle?: boolean;
  /** The verbosity subset this client receives. Defaults to `normal`. */
  readonly verbosity?: DaemonVerbosity;
  /** The client's terminal width in columns, when known. */
  readonly columns?: number;
  /** The client's color support level (0-3), when known. */
  readonly colorLevel?: number;
}
