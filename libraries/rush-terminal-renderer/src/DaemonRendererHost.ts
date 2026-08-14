// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  DaemonVerbosity,
  IDaemonEventEnvelope
} from '@rushstack/rush-daemon-protocol';
import { TerminalChunkKind } from '@rushstack/terminal';

import type { IDaemonRenderer } from './DaemonRenderer';
import type { IDaemonRendererHostOptions } from './DaemonRendererHostOptions';
import type { IDaemonRendererTerminal } from './DaemonRendererTerminal';
import { HostEventRouter } from './HostEventRouter';
import { LegacyCollatedRenderer } from './LegacyCollatedRenderer';
import { OperationStreamRegistry } from './OperationStreamRegistry';
import { TerminalSinkWritable } from './TerminalSinkWritable';
import { shouldRemoveColors } from './TerminalStatuses';

const DEFAULT_VERBOSITY: DaemonVerbosity = 'normal';
const QUIET_VERBOSITY: DaemonVerbosity = 'quiet';

function toChunkKind(stream: 'stdout' | 'stderr'): TerminalChunkKind {
  return stream === 'stderr' ? TerminalChunkKind.Stderr : TerminalChunkKind.Stdout;
}

const CHUNK_DECODER: InstanceType<typeof TextDecoder> = new TextDecoder('utf8', { fatal: false });

/**
 * The CLI client's presentation host: routes decoded daemon frames to the
 * per-operation collator and to the event renderer.
 * @beta
 */
export class DaemonRendererHost {
  private readonly _renderer: IDaemonRenderer;
  private readonly _verbosity: DaemonVerbosity;
  private readonly _streams: OperationStreamRegistry;
  private readonly _router: HostEventRouter;
  private readonly _terminal: IDaemonRendererTerminal;

  public constructor(options: IDaemonRendererHostOptions) {
    this._terminal = options.terminal;
    this._verbosity = options.verbosity ?? DEFAULT_VERBOSITY;
    this._renderer = options.renderer ?? new LegacyCollatedRenderer();
    this._streams = new OperationStreamRegistry({
      destination: new TerminalSinkWritable(options.terminal),
      removeColors: shouldRemoveColors(options.colorLevel),
      quiet: this._verbosity === QUIET_VERBOSITY
    });
    this._router = new HostEventRouter(this._streams, this._renderer, this._verbosity);
  }

  /**
   * Initializes the renderer. Must be awaited before the first
   * {@link DaemonRendererHost.handleEvent} call.
   */
  public async initializeAsync(): Promise<void> {
    await this._renderer.initializeAsync({ terminal: this._terminal });
  }

  /** Feeds one decoded `0x05` event envelope into the host. */
  public handleEvent(envelope: IDaemonEventEnvelope): void {
    this._router.routeEvent(envelope);
  }

  /** Feeds one decoded `0x02`/`0x03` log chunk into the collator. */
  public handleLogChunk(operationId: string, stream: 'stdout' | 'stderr', chunk: Uint8Array): void {
    if (stream === 'stdout' && this._verbosity === QUIET_VERBOSITY) {
      // Match the legacy quiet-mode DiscardStdoutTransform: per-client display
      // filtering, without mutating the shared stream.
      return;
    }
    this._streams.writeChunk(operationId, {
      kind: toChunkKind(stream),
      text: CHUNK_DECODER.decode(chunk)
    });
  }

  /** Flushes and closes the renderer. */
  public async closeAsync(): Promise<void> {
    await this._renderer.flushAsync();
    await this._renderer.closeAsync();
  }
}
