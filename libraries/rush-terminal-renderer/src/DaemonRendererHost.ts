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
  readonly #renderer: IDaemonRenderer;
  readonly #verbosity: DaemonVerbosity;
  readonly #streams: OperationStreamRegistry;
  readonly #router: HostEventRouter;
  readonly #terminal: IDaemonRendererTerminal;

  public constructor(options: IDaemonRendererHostOptions) {
    this.#terminal = options.terminal;
    this.#verbosity = options.verbosity ?? DEFAULT_VERBOSITY;
    this.#renderer = options.renderer ?? new LegacyCollatedRenderer();
    this.#streams = new OperationStreamRegistry({
      destination: new TerminalSinkWritable(options.terminal),
      removeColors: shouldRemoveColors(options.colorLevel),
      quiet: this.#verbosity === QUIET_VERBOSITY
    });
    this.#router = new HostEventRouter(this.#streams, this.#renderer, this.#verbosity);
  }

  /**
   * Initializes the renderer. Must be awaited before the first
   * {@link DaemonRendererHost.handleEvent} call.
   */
  public async initializeAsync(): Promise<void> {
    await this.#renderer.initializeAsync({ terminal: this.#terminal });
  }

  /** Feeds one decoded `0x05` event envelope into the host. */
  public handleEvent(envelope: IDaemonEventEnvelope): void {
    this.#router.routeEvent(envelope);
  }

  /** Feeds one decoded `0x02`/`0x03` log chunk into the collator. */
  public handleLogChunk(operationId: string, stream: 'stdout' | 'stderr', chunk: Uint8Array): void {
    if (stream === 'stdout' && this.#verbosity === QUIET_VERBOSITY) {
      // Match the legacy quiet-mode DiscardStdoutTransform: per-client display
      // filtering, without mutating the shared stream.
      return;
    }
    this.#streams.writeChunk(operationId, {
      kind: toChunkKind(stream),
      text: CHUNK_DECODER.decode(chunk)
    });
  }

  /** Flushes and closes the renderer. */
  public async closeAsync(): Promise<void> {
    await this.#renderer.flushAsync();
    await this.#renderer.closeAsync();
  }
}
