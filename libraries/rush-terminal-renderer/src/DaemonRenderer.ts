// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO(reconcile): this interface intentionally mirrors `@rushstack/reporter`'s
// `IReporter` (name/initializeAsync/report/flushAsync/closeAsync) so the real
// `default`/`ai`/`plaintext` reporters drop in unchanged once that package merges.

import type { IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

import type { IDaemonRendererTerminal } from './DaemonRendererTerminal';

/**
 * The context supplied to a renderer when it is initialized.
 *
 * @beta
 */
export interface IDaemonRendererContext {
  /** The terminal the renderer renders to. */
  readonly terminal: IDaemonRendererTerminal;
}

/**
 * A subscriber that renders daemon events to the client's terminal.
 *
 * @remarks
 * The host owns ordering and fan-out; `report` is called once per event in
 * wire order and is never called concurrently with itself.
 *
 * @beta
 */
export interface IDaemonRenderer {
  /** A stable, unique name for this renderer. */
  readonly name: string;

  /** Prepares the renderer for use. */
  initializeAsync(context: IDaemonRendererContext): Promise<void>;

  /** Renders a single event. Called in wire order. */
  report(event: IDaemonEventEnvelope): void;

  /** Flushes any buffered output. */
  flushAsync(): Promise<void>;

  /** Flushes and releases the renderer's destination. */
  closeAsync(): Promise<void>;
}
