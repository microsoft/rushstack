// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonCommandResult } from './DaemonCommandResult';
import type { DaemonTerminalRequirement } from './DaemonTerminalPolicy';

/**
 * The enabled state assigned to one selected operation by a phased request.
 *
 * @beta
 */
export type DaemonPhasedOperationEnabledState = true | 'ignore-dependency-changes';

/**
 * One caller-resolved operation selection.
 *
 * @remarks
 * Operation identifiers come from the integration-owned real operation graph. Command-line parsing and graph
 * construction remain outside the wire contract.
 *
 * @beta
 */
export interface IDaemonPhasedOperationSelection {
  /** The non-disabled state to apply with the real graph's enabled-state API. */
  readonly enabledState: DaemonPhasedOperationEnabledState;
  /** The integration-resolved operation identifier. */
  readonly operationId: string;
}

/**
 * The explicit phase and plugin shape of the warm graph used by a phased request.
 *
 * @beta
 */
export interface IDaemonPhasedEngineShape {
  /** Every phase represented by the warm graph. */
  readonly phaseNames: ReadonlyArray<string>;
  /** Every plugin applied when the warm graph was constructed. */
  readonly pluginNames: ReadonlyArray<string>;
}

/**
 * A typed phased request after an integration has parsed the command and resolved its operation selection.
 *
 * @beta
 */
export interface IDaemonPhasedRequest {
  /** Whether the command accepts request-scoped stdin bytes. */
  readonly acceptsStdin?: boolean;
  /** The parsed phased command name. */
  readonly commandName: string;
  /** The exact warm engine shape against which the selection was resolved. */
  readonly engineShape: IDaemonPhasedEngineShape;
  /** The request environment used for Rush command policy without mutating the daemon process environment. */
  readonly environment: Readonly<Record<string, string>>;
  /** The caller-resolved selected operations and their enabled states. */
  readonly operationSelection: ReadonlyArray<IDaemonPhasedOperationSelection>;
  /** A client-generated identifier unique within the connection. */
  readonly requestId: string;
  /** Terminal capability needed by the resolved command. */
  readonly terminalRequirement?: DaemonTerminalRequirement;
}

/**
 * The client-scoped result for one selected operation.
 *
 * @beta
 */
export interface IDaemonPhasedOperationResult {
  /** The operation identifier used by the request and its streamed output. */
  readonly operationId: string;
  /** The raw Rush operation status. */
  readonly status: string;
  /** The operation error message, when execution produced one. */
  readonly errorMessage?: string;
}

/**
 * The result of routing one phased request through a warm operation graph.
 *
 * @beta
 */
export interface IDaemonPhasedRequestResult extends IDaemonCommandResult {
  /** Results only for operations enabled for this client. */
  readonly operationResults: ReadonlyArray<IDaemonPhasedOperationResult>;
  /** The identifier copied from the request. */
  readonly requestId: string;
  /** Whether the real graph scheduled work for this iteration. */
  readonly scheduled: boolean;
}
