// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonRequestAdmissionOptions } from './DaemonRequestAdmission';
import type { DaemonRushCommandOrigin } from './DaemonRushCommand';
import type { DaemonTerminalRequirement } from './DaemonTerminalPolicy';

/**
 * Terminal capabilities captured for one daemon request.
 *
 * @beta
 */
export interface IDaemonRequestTerminal {
  /** Whether the resolved command accepts request-tagged stdin frames. */
  readonly acceptsStdin?: boolean;
  /** The terminal width captured when the request starts. */
  readonly columns?: number;
  /** Whether the client output is attached to a TTY. */
  readonly isTTY: boolean;
  /** Whether terminal output supports ANSI color. */
  readonly supportsColor: boolean;
  /** The terminal access required by the resolved command. */
  readonly terminalRequirement?: DaemonTerminalRequirement;
}

/**
 * A presentation-free command envelope submitted to a warm daemon workspace.
 *
 * @remarks
 * The integration owns command parsing and resolves this envelope into an existing typed phased or global request.
 * The wire layer never constructs Rush actions or operation selections.
 *
 * @beta
 */
export interface IDaemonRequestEnvelope {
  /** Queue-and-wait behavior requested by the client integration. */
  readonly admission?: IDaemonRequestAdmissionOptions;
  /** The original command arguments, excluding the Rush executable. */
  readonly argv: ReadonlyArray<string>;
  /** The command name identified by the client integration. */
  readonly commandName: string;
  /** Whether the integration resolved a built-in or custom Rush command. */
  readonly commandOrigin: DaemonRushCommandOrigin;
  /** The request-local working directory. */
  readonly cwd: string;
  /** A complete request-local environment snapshot. */
  readonly environment: Readonly<Record<string, string>>;
  /** A client-generated identifier unique within this connection. */
  readonly requestId: string;
  /** Request-local terminal capabilities. */
  readonly terminal: IDaemonRequestTerminal;
}
