// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of runtime imports: AgentProgressRenderer, which start.ts loads before
// @microsoft/rush-lib, uses it.

import type { IDaemonClientLivenessOptions, IDaemonSilence } from '@rushstack/rush-client-core';

/**
 * What a daemon that has not responded means, and what to do, to follow a semicolon. `rush-client daemon status`
 * would not help: it waits 5 s for the same daemon to get ready, and then says only that it did not.
 */
export const DAEMON_SILENCE_ADVICE: string =
  'its process may be stopped or overloaded. This command goes on if rushd responds; interrupt it (Ctrl+C) to stop waiting';

function formatDaemon(pid: number | undefined): string {
  return pid === undefined ? 'rushd' : `rushd (PID ${pid})`;
}

function formatSeconds(ms: number): string {
  return `${Math.floor(ms / 1000)}s`;
}

/** Says how long the daemon has sent nothing, for example "rushd (PID 41) has not responded for 30s". */
export function formatDaemonSilence(pid: number | undefined, silentForMs: number): string {
  return `${formatDaemon(pid)} has not responded for ${formatSeconds(silentForMs)}`;
}

/** Says that the daemon sent something again, for example "rushd (PID 41) responded again after 70s". */
export function formatDaemonResponded(silence: IDaemonSilence): string {
  return `${formatDaemon(silence.pid)} responded again after ${formatSeconds(silence.silentForMs)}`;
}

/** The agent renderer's methods for a daemon that stops responding, and for one that responds again. */
export interface IAgentDaemonSilenceRenderer {
  onDaemonUnresponsive(silence: IDaemonSilence): void;
  onDaemonResponsive(silence: IDaemonSilence): void;
}

/** Where the lines about a daemon that stopped responding go. */
export interface IDaemonSilenceTarget {
  readonly rushx: boolean;
  readonly agentRenderer: IAgentDaemonSilenceRenderer | undefined;
  readonly writeStderrAsync: (text: string) => Promise<void>;
}

/**
 * Creates a request's liveness check. When the daemon stops responding, the agent renderer says so, if one is
 * active, and otherwise a line on stderr does, with what to do. When it responds again, a second line says so.
 * An interrupt asks the daemon to cancel the request; a stopped daemon cannot confirm that, so the client stops
 * waiting when its cancellation timeout ends.
 */
export function createDaemonLivenessOptions(target: IDaemonSilenceTarget): IDaemonClientLivenessOptions {
  const { agentRenderer } = target;
  const prefix: string = target.rushx ? 'rushx-client' : 'rush-client';
  const writeLine = (line: string): void => {
    // After SIGHUP the terminal may be gone.
    target.writeStderrAsync(`${prefix}: ${line}\n`).catch(() => undefined);
  };
  return {
    onUnresponsive: (silence: IDaemonSilence): void => {
      if (agentRenderer) {
        agentRenderer.onDaemonUnresponsive(silence);
        return;
      }
      writeLine(`${formatDaemonSilence(silence.pid, silence.silentForMs)}; ${DAEMON_SILENCE_ADVICE}.`);
    },
    onResponsive: (silence: IDaemonSilence): void => {
      if (agentRenderer) {
        agentRenderer.onDaemonResponsive(silence);
        return;
      }
      writeLine(`${formatDaemonResponded(silence)}.`);
    }
  };
}
