// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'node:os';

import type { IDaemonActivityPayload, IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

import type { IDaemonRenderer, IDaemonRendererContext } from './DaemonRenderer';
import type { IDaemonRendererTerminal } from './DaemonRendererTerminal';

const RENDERER_NAME: string = 'legacy-collated';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isActivityPayload(payload: unknown): payload is IDaemonActivityPayload {
  return isRecord(payload) && typeof payload.text === 'string';
}

/**
 * The default renderer: byte-faithful with the legacy in-process terminal
 * output for the same event stream. Per-operation collation and headers are
 * handled by the host's `StreamCollator`; this renderer prints activity lines
 * (the structured form of the legacy summary/status text).
 *
 * @remarks
 * Daemon-specific chrome must be additive and isolated: new presentation
 * belongs in additional renderers, not in edits here.
 *
 * @beta
 */
export class LegacyCollatedRenderer implements IDaemonRenderer {
  public readonly name: string = RENDERER_NAME;
  #terminal: IDaemonRendererTerminal | undefined;

  /** {@inheritDoc IDaemonRenderer.initializeAsync} */
  public async initializeAsync(context: IDaemonRendererContext): Promise<void> {
    this.#terminal = context.terminal;
  }

  /** {@inheritDoc IDaemonRenderer.report} */
  public report(event: IDaemonEventEnvelope): void {
    if (event.type !== 'activityChanged' || !isActivityPayload(event.payload)) {
      return;
    }
    this._writeLine(event.payload.text);
  }

  private _writeLine(text: string): void {
    // Emit the client's OS newline, matching the newline normalization the
    // collated pipeline applies (TextRewriterTransform OsDefault) so global
    // status lines and collated blocks are consistent on every platform.
    this.#terminal?.write(`${text}${EOL}`, 'stdout');
  }

  /** {@inheritDoc IDaemonRenderer.flushAsync} */
  public async flushAsync(): Promise<void> {
    // Append-only writes need no flush.
  }

  /** {@inheritDoc IDaemonRenderer.closeAsync} */
  public async closeAsync(): Promise<void> {
    this.#terminal = undefined;
  }
}
