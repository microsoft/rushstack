// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonVerbosity } from '@rushstack/rush-daemon-protocol';

import type { IDaemonRenderer } from './DaemonRenderer';
import type { IDaemonRendererTerminal } from './DaemonRendererTerminal';

/**
 * Options for {@link DaemonRendererHost}.
 *
 * @beta
 */
export interface IDaemonRendererHostOptions {
  /** The client terminal to render to. */
  readonly terminal: IDaemonRendererTerminal;
  /** This client's verbosity; filters events at this subscription only. */
  readonly verbosity?: DaemonVerbosity;
  /** The event renderer. Defaults to the legacy-compatible renderer. */
  readonly renderer?: IDaemonRenderer;
  /** The client's color level; `0`/undefined on a non-TTY strips ANSI colors. */
  readonly colorLevel?: number;
}
