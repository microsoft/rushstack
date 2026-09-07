// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'node:os';

import type { IDaemonActivityPayload, IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

import type { IDaemonRenderer, IDaemonRendererContext } from './DaemonRenderer';
import type { DaemonRenderStream, IDaemonRendererTerminal } from './DaemonRendererTerminal';

const RENDERER_NAME: string = 'legacy-collated';
const NEWLINE: string = '\n';
const EMPTY: string = '';
const NEWLINES: RegExp = /\r?\n/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isActivityPayload(payload: unknown): payload is IDaemonActivityPayload {
  return isRecord(payload) && typeof payload.text === 'string';
}

function activityStream(stream: DaemonRenderStream | undefined): DaemonRenderStream {
  return stream === 'stderr' ? 'stderr' : 'stdout';
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
  private _terminal: IDaemonRendererTerminal | undefined;

  /** {@inheritDoc IDaemonRenderer.initializeAsync} */
  public async initializeAsync(context: IDaemonRendererContext): Promise<void> {
    this._terminal = context.terminal;
  }

  /** {@inheritDoc IDaemonRenderer.report} */
  public report(event: IDaemonEventEnvelope): void {
    if (event.type !== 'activityChanged' || !isActivityPayload(event.payload)) {
      return;
    }
    this._writeLine(event.payload.text, activityStream(event.payload.stream));
  }

  private _writeLine(text: string, stream: DaemonRenderStream): void {
    // Emit the client's OS newline, matching the newline normalization the
    // collated pipeline applies (TextRewriterTransform OsDefault) so global
    // status lines and collated blocks are consistent on every platform.
    this._terminal?.write(
      `${text.replace(NEWLINES, EOL)}${text.endsWith(NEWLINE) ? EMPTY : EOL}`, stream
    );
  }

  /** {@inheritDoc IDaemonRenderer.flushAsync} */
  public async flushAsync(): Promise<void> {
    // Append-only writes need no flush.
  }

  /** {@inheritDoc IDaemonRenderer.closeAsync} */
  public async closeAsync(): Promise<void> {
    this._terminal = undefined;
  }
}
