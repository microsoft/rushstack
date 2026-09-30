// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonClientLivenessOptions } from '@rushstack/rush-client-core';

import { createDaemonLivenessOptions } from '../daemonSilence';
import type { IAgentDaemonSilenceRenderer } from '../daemonSilence';

describe(createDaemonLivenessOptions.name, () => {
  function createLegacy(rushx: boolean): { liveness: IDaemonClientLivenessOptions; written: string[] } {
    const written: string[] = [];
    const liveness: IDaemonClientLivenessOptions = createDaemonLivenessOptions({
      rushx,
      agentRenderer: undefined,
      writeStderrAsync: async (text: string) => {
        written.push(text);
      }
    });
    return { liveness, written };
  }

  it('writes a line with what to do when rushd stops responding, and one when it responds again', () => {
    const { liveness, written } = createLegacy(false);
    liveness.onUnresponsive({ pid: 12345, silentForMs: 30_999 });
    liveness.onResponsive?.({ pid: 12345, silentForMs: 70_200 });
    expect(written).toEqual([
      'rush-client: rushd (PID 12345) has not responded for 30s; its process may be stopped or overloaded; on Linux, "rush-client daemon status" says which. This command goes on if rushd responds; interrupt it (Ctrl+C) to stop waiting.\n',
      'rush-client: rushd (PID 12345) responded again after 70s.\n'
    ]);
  });

  it('names rushx-client, and names no PID when rushd reported none', () => {
    const { liveness, written } = createLegacy(true);
    liveness.onUnresponsive({ pid: undefined, silentForMs: 30_000 });
    liveness.onResponsive?.({ pid: undefined, silentForMs: 31_000 });
    expect(written).toEqual([
      'rushx-client: rushd has not responded for 30s; its process may be stopped or overloaded; on Linux, "rush-client daemon status" says which. This command goes on if rushd responds; interrupt it (Ctrl+C) to stop waiting.\n',
      'rushx-client: rushd responded again after 31s.\n'
    ]);
  });

  it('leaves both reports to the agent renderer when it is active', () => {
    const written: string[] = [];
    const agentRenderer: IAgentDaemonSilenceRenderer = {
      onDaemonUnresponsive: jest.fn(),
      onDaemonResponsive: jest.fn()
    };
    const liveness: IDaemonClientLivenessOptions = createDaemonLivenessOptions({
      rushx: false,
      agentRenderer,
      writeStderrAsync: async (text: string) => {
        written.push(text);
      }
    });
    liveness.onUnresponsive({ pid: 41, silentForMs: 30_000 });
    liveness.onResponsive?.({ pid: 41, silentForMs: 40_000 });
    expect(agentRenderer.onDaemonUnresponsive).toHaveBeenCalledWith({ pid: 41, silentForMs: 30_000 });
    expect(agentRenderer.onDaemonResponsive).toHaveBeenCalledWith({ pid: 41, silentForMs: 40_000 });
    expect(written).toEqual([]);
  });
});
