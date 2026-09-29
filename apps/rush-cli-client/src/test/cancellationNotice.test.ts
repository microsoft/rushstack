// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@microsoft/rush/lib/start', () => ({}));
jest.mock('@rushstack/rush-client-core', () => ({
  ...jest.requireActual('@rushstack/rush-client-core'),
  connectOrAwaitDaemonStartupAsync: jest.fn(),
  executeWithDaemonRestartAsync: jest.fn()
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DaemonClientError,
  connectOrAwaitDaemonStartupAsync,
  executeWithDaemonRestartAsync,
  type DaemonClient,
  type DaemonClientOutcome,
  type IDaemonClientExecuteOptions
} from '@rushstack/rush-client-core';

import { AgentProgressRenderer } from '../AgentProgressRenderer';
import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';
import { getTestProcessEnvironment } from './TestProcessEnvironment';

const CANCELLING: string =
  'rush-client: cancelling build; waiting up to 5 s for rushd to stop the request.\n';
const CANCELLED: string = 'rush-client: build cancelled.\n';
const UNCONFIRMED: string =
  'rush-client: build cancelled, but rushd did not confirm that the request stopped; it may still be stopping.\n';

type Execution = (options: IDaemonClientExecuteOptions) => Promise<DaemonClientOutcome>;

describe('the cancellation of a daemon request (task 132)', () => {
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let originalExitCode: typeof process.exitCode;
  let listenersBefore: Map<NodeJS.Signals, unknown[]>;
  let stderr: string[];
  /** What the client had written to stderr when the daemon heard of the cancellation. */
  let stderrAtCancel: string[] | undefined;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-cancellation-'));
    originalArgv = process.argv;
    originalEnvironment = process.env;
    originalExitCode = process.exitCode;
    listenersBefore = new Map(
      (['SIGINT', 'SIGTERM'] as const).map((signal) => [signal, process.listeners(signal)])
    );
    stderr = [];
    stderrAtCancel = undefined;
    fs.writeFileSync(
      path.join(folder, 'rush.json'),
      JSON.stringify({ rushVersion: '5.178.1', pnpmVersion: '10.27.0', projects: [] })
    );
    jest.spyOn(connectionOptions, 'getDaemonConnectionOptionsAsync').mockResolvedValue({
      paths: {
        runtimeDir: folder,
        socketPath: path.join(folder, 'd.sock'),
        lockfilePath: path.join(folder, 'daemon.pid.json')
      }
    });
    jest.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      ...rest: unknown[]
    ): boolean => {
      stderr.push(Buffer.from(chunk).toString());
      (rest.find((argument) => typeof argument === 'function') as (() => void) | undefined)?.();
      return true;
    }) as typeof process.stderr.write);
    jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(process, 'cwd').mockReturnValue(folder);
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockResolvedValue({
      closeAsync: async () => undefined,
      status: Promise.resolve({ pid: process.pid })
    } as unknown as DaemonClient);
    process.argv = [process.execPath, 'rush-client', 'build', '--to', 'project'];
    const environment: NodeJS.ProcessEnv = getTestProcessEnvironment(originalEnvironment);
    for (const name of Object.keys(environment)) {
      if (name.startsWith('RUSH_')) delete environment[name];
    }
    process.env = { ...environment, RUSH_DAEMON: '1' };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnvironment;
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
    jest.mocked(connectOrAwaitDaemonStartupAsync).mockReset();
    jest.mocked(executeWithDaemonRestartAsync).mockReset();
    fs.rmSync(folder, { recursive: true });
  });

  /** Delivers a signal to the listener that the client installed, without signalling the test process. */
  function deliverSignal(name: 'SIGINT' | 'SIGTERM'): void {
    const installed: unknown[] = process
      .listeners(name)
      .filter((listener) => !listenersBefore.get(name)!.includes(listener));
    expect(installed).toHaveLength(1);
    (installed[0] as (signal: NodeJS.Signals) => void)(name);
  }

  /** Runs the request on a daemon that `execute` plays, as `DaemonClient` reports it to the client. */
  function execute(execution: Execution): void {
    jest
      .mocked(executeWithDaemonRestartAsync)
      .mockImplementation((client, connection, options) => execution(options));
  }

  /** The daemon hears of the cancellation, with the default deadline of `DaemonClient`. */
  function requestCancel(options: IDaemonClientExecuteOptions): void {
    options.onCancelRequested!(5000);
    stderrAtCancel = [...stderr];
  }

  function aborted(options: IDaemonClientExecuteOptions): DaemonClientOutcome {
    return {
      kind: 'result',
      result: { requestId: options.request.requestId, exitCode: 130, outcome: 'aborted', aborted: true }
    };
  }

  function cancellationDeadline(): DaemonClientError {
    return new DaemonClientError(
      'timeout',
      'Daemon did not finish cancellation; disconnected without retrying the command.'
    );
  }

  function disconnected(): DaemonClientError {
    return new DaemonClientError(
      'disconnected',
      'Daemon disconnected before delivering a result; the command was not retried.'
    );
  }

  it('says at once that it waits for rushd, and keeps the final line when rushd confirms the stop', async () => {
    execute(async (options) => {
      deliverSignal('SIGINT');
      expect(options.abortSignal!.aborted).toBe(true);
      requestCancel(options);
      return aborted(options);
    });
    await launchClientAsync(false);
    expect(stderrAtCancel).toEqual([CANCELLING]);
    expect(stderr).toEqual([CANCELLING, CANCELLED]);
    expect(process.exitCode).toBe(130);
  });

  it('says so when rushd does not confirm the stop before the cancellation deadline', async () => {
    execute(async (options) => {
      deliverSignal('SIGTERM');
      requestCancel(options);
      throw cancellationDeadline();
    });
    await launchClientAsync(false);
    expect(stderr).toEqual([CANCELLING, UNCONFIRMED]);
    expect(process.exitCode).toBe(143);
  });

  it('reports a raw Ctrl+C, which raises no signal, like SIGINT', async () => {
    execute(async (options) => {
      requestCancel(options);
      expect(options.abortSignal!.aborted).toBe(false);
      throw cancellationDeadline();
    });
    await launchClientAsync(false);
    expect(stderr).toEqual([CANCELLING, UNCONFIRMED]);
    expect(process.exitCode).toBe(130);
  });

  it('adds nothing when the request never reached rushd, which has nothing to stop', async () => {
    execute(async (options) => {
      deliverSignal('SIGINT');
      return aborted(options);
    });
    await launchClientAsync(false);
    expect(stderr).toEqual([CANCELLED]);
    expect(process.exitCode).toBe(130);
  });

  it('adds nothing when the connection fails before the client asked rushd to stop the request', async () => {
    // For example, a signal while the client waits for a restarted daemon, whose connection then fails.
    execute(async (options) => {
      deliverSignal('SIGINT');
      expect(options.abortSignal!.aborted).toBe(true);
      throw disconnected();
    });
    await launchClientAsync(false);
    expect(stderr).toEqual([CANCELLED]);
    expect(process.exitCode).toBe(130);
  });

  it('writes both notices in the agent output, once', async () => {
    const output: string[] = [];
    const renderer: AgentProgressRenderer = new AgentProgressRenderer({
      commandName: 'build',
      isTTY: false,
      columns: 80,
      write: (text: string) => output.push(text)
    });
    let outputAtCancel: string[] | undefined;
    execute(async (options) => {
      deliverSignal('SIGINT');
      requestCancel(options);
      outputAtCancel = [...output];
      throw cancellationDeadline();
    });
    await launchClientAsync(false, renderer);
    const lines: string[] = output.join('').split('\n').slice(0, -1);
    expect(outputAtCancel).toHaveLength(2);
    expect(lines).toEqual([
      expect.stringMatching(/^rush build · \d+\.\ds · sent to rushd; preparing the workspace graph /),
      expect.stringMatching(
        /^rush build · \d+\.\ds · cancelling; waiting up to 5s for rushd to stop the request$/
      ),
      expect.stringMatching(
        /^rush build: CANCELLED in \d+\.\ds · rushd did not confirm that the request stopped; it may still be stopping$/
      )
    ]);
    // The summary line says whether rushd confirmed the stop, so the legacy notices add nothing to it.
    expect(stderr).toEqual([CANCELLED]);
    expect(process.exitCode).toBe(130);
  });

  it('ends the agent summary line without a stop to confirm when the client never asked rushd to stop', async () => {
    const output: string[] = [];
    const renderer: AgentProgressRenderer = new AgentProgressRenderer({
      commandName: 'build',
      isTTY: false,
      columns: 80,
      write: (text: string) => output.push(text)
    });
    execute(async () => {
      deliverSignal('SIGINT');
      throw disconnected();
    });
    await launchClientAsync(false, renderer);
    const lines: string[] = output.join('').split('\n').slice(0, -1);
    expect(lines).toEqual([
      expect.stringMatching(/^rush build · \d+\.\ds · sent to rushd; preparing the workspace graph /),
      expect.stringMatching(/^rush build: CANCELLED in \d+\.\ds$/)
    ]);
    expect(stderr).toEqual([CANCELLED]);
    expect(process.exitCode).toBe(130);
  });
});
