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
import { Writable } from 'node:stream';

import {
  DaemonClientError,
  connectOrAwaitDaemonStartupAsync,
  executeWithDaemonRestartAsync,
  type DaemonClient,
  type DaemonClientOutcome,
  type IDaemonClientExecuteOptions
} from '@rushstack/rush-client-core';
import type { DaemonRestartReason } from '@rushstack/rush-daemon-protocol';

import { AgentProgressRenderer } from '../AgentProgressRenderer';
import { ClientOutput } from '../clientOutput';
import * as connectionOptions from '../daemonConnectionOptions';
import { launchClientAsync } from '../launchClient';
import { getTestProcessEnvironment } from './TestProcessEnvironment';

const CANCELLING: string =
  'rush-client: cancelling build; waiting up to 5 s for rushd to stop the request.\n';
const CANCELLED: string = 'rush-client: build cancelled.\n';
const UNCONFIRMED: string =
  'rush-client: build cancelled, but rushd did not confirm that the request stopped; it may still be stopping.\n';

const CLOSED_STDOUT: string =
  'rush-client: build cancelled, because the process reading its stdout exited (EPIPE).\n';

type Execution = (options: IDaemonClientExecuteOptions) => Promise<DaemonClientOutcome>;

function brokenPipe(): NodeJS.ErrnoException {
  return Object.assign(new Error('write EPIPE'), { code: 'EPIPE', errno: -32, syscall: 'write' });
}

/** Agent output whose writes fail once `readerExited` is set, as a pipe's do once the process reading it exits. */
class ClosingOutput extends Writable {
  public text: string = '';
  public readerExited: boolean = false;

  public constructor() {
    super({
      write: (chunk: Buffer, encoding, callback) => {
        if (this.readerExited) {
          callback(brokenPipe());
        } else {
          this.text += chunk.toString();
          callback();
        }
      }
    });
  }
}

describe('the cancellation of a daemon request (task 132)', () => {
  let folder: string;
  let originalArgv: string[];
  let originalEnvironment: NodeJS.ProcessEnv;
  let originalExitCode: typeof process.exitCode;
  let listenersBefore: Map<NodeJS.Signals, unknown[]>;
  let errorListenersBefore: Map<NodeJS.WriteStream, unknown[]>;
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
    errorListenersBefore = new Map(
      [process.stdout, process.stderr].map((stream) => [stream, stream.listeners('error')])
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
    // A failed write leaves its 'error' listener, which a real pipe's error event would have removed.
    for (const [stream, listeners] of errorListenersBefore) {
      for (const listener of stream.listeners('error')) {
        if (!listeners.includes(listener)) stream.removeListener('error', listener as (error: Error) => void);
      }
    }
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

  /**
   * Makes each write to `stream` fail, as a pipe's writes do once the process reading it (for example `head`)
   * exited, and records what the client tried to write.
   */
  function closeReader(stream: NodeJS.WriteStream, written: string[] = []): void {
    jest.spyOn(stream, 'write').mockImplementation(((
      chunk: string | Uint8Array,
      ...rest: unknown[]
    ): boolean => {
      written.push(Buffer.from(chunk).toString());
      const callback: ((error: Error) => void) | undefined = rest.find(
        (argument) => typeof argument === 'function'
      ) as ((error: Error) => void) | undefined;
      process.nextTick(() => callback?.(brokenPipe()));
      return false;
    }) as typeof stream.write);
  }

  /** Resolves once the client aborts the request; `DaemonClient` then asks rushd to cancel it. */
  async function abortedAsync(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await new Promise<void>((resolve, reject) => {
      const timer: NodeJS.Timeout = setTimeout(
        () => reject(new Error('The client did not cancel the request.')),
        2000
      );
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
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

  it('writes no restart wait line once it asks rushd to cancel (task 166)', async () => {
    const lockfile: DaemonRestartReason = {
      kind: 'workspaceInputsChanged',
      installationFiles: ['common/config/rush/pnpm-lock.yaml']
    };
    const environment: DaemonRestartReason = { kind: 'environmentChanged', variableNames: ['FOO'] };
    execute(async (options) => {
      await options.onQueuePositionAsync!(1, lockfile, { scriptCount: 1 });
      deliverSignal('SIGINT');
      requestCancel(options);
      // A new cause would get a line at once on a pipe.
      await options.onQueuePositionAsync!(1, environment, { scriptCount: 1 });
      return aborted(options);
    });
    await launchClientAsync(false);
    expect(stderr).toEqual([
      `rush-client: waiting for 1 running rushx script to finish; the daemon (PID ${process.pid}) then restarts, ` +
        'because common/config/rush/pnpm-lock.yaml changed.\n',
      CANCELLING,
      CANCELLED
    ]);
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

  it.each([
    ['confirms', 'rushx-client: build cancelled.\n'],
    [
      'does not confirm',
      'rushx-client: build cancelled, but rushd did not confirm that the request stopped; it may still be ' +
        'stopping.\n'
    ]
  ])(
    'begins both notices of a rushx script with rushx-client when rushd %s the stop (task 189)',
    async (confirmation: string, cancelled: string) => {
      process.argv = [process.execPath, 'rushx-client', 'build'];
      execute(async (options) => {
        deliverSignal('SIGINT');
        requestCancel(options);
        if (confirmation === 'confirms') return aborted(options);
        throw cancellationDeadline();
      });
      await launchClientAsync(true);
      expect(stderr).toEqual([
        'rushx-client: cancelling build; waiting up to 5 s for rushd to stop the request.\n',
        cancelled
      ]);
      expect(process.exitCode).toBe(130);
    }
  );

  it('begins the error line of a rushx script that rushd failed with rushx-client, like its notices (task 189)', async () => {
    process.argv = [process.execPath, 'rushx-client', 'build'];
    execute(async (options) => ({
      kind: 'result',
      result: {
        requestId: options.request.requestId,
        exitCode: 1,
        outcome: 'failure',
        aborted: false,
        errorMessage: 'The daemon shut down before the request finished.'
      }
    }));
    await launchClientAsync(true);
    expect(stderr).toEqual(['rushx-client: The daemon shut down before the request finished.\n']);
    expect(process.exitCode).toBe(1);
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

  describe('when the process reading its output exits, as `head` does (task 226)', () => {
    it('cancels the request, says why in one line and exits with 141, as SIGPIPE would', async () => {
      closeReader(process.stdout);
      execute(async (options) => {
        // As for `rush-client build --verbose | head -5`, once head has read its lines.
        await options.onStdoutAsync!(Buffer.from('built-a\n'), options.request.requestId);
        await abortedAsync(options.abortSignal!);
        requestCancel(options);
        return aborted(options);
      });
      await launchClientAsync(false);
      // Nothing is left to read a line that says the client waits for rushd.
      expect(stderrAtCancel).toEqual([]);
      expect(stderr).toEqual([CLOSED_STDOUT]);
      expect(process.exitCode).toBe(141);
    });

    it.each([
      ['confirms', 'rushx-client: build cancelled, because the process reading its stdout exited (EPIPE).\n'],
      [
        'does not confirm',
        'rushx-client: build cancelled, because the process reading its stdout exited (EPIPE), but rushd did ' +
          'not confirm that the request stopped; it may still be stopping.\n'
      ]
    ])(
      'begins the line of a rushx script with rushx-client when rushd %s the stop, like its other notices (task 189)',
      async (confirmation: string, closed: string) => {
        process.argv = [process.execPath, 'rushx-client', 'build'];
        closeReader(process.stdout);
        execute(async (options) => {
          await options.onStdoutAsync!(Buffer.from('built-a\n'), options.request.requestId);
          await abortedAsync(options.abortSignal!);
          requestCancel(options);
          if (confirmation === 'confirms') return aborted(options);
          throw cancellationDeadline();
        });
        await launchClientAsync(true);
        expect(stderr).toEqual([closed]);
        expect(process.exitCode).toBe(141);
      }
    );

    it('fails no write when stderr has the same reader (`2>&1 | head`)', async () => {
      const written: string[] = [];
      closeReader(process.stdout, written);
      closeReader(process.stderr, written);
      execute(async (options) => {
        await options.onStdoutAsync!(Buffer.from('built-a\n'), options.request.requestId);
        await abortedAsync(options.abortSignal!);
        requestCancel(options);
        return aborted(options);
      });
      await launchClientAsync(false);
      expect(written).toEqual(['built-a\n', CLOSED_STDOUT]);
      expect(process.exitCode).toBe(141);
    });

    it("keeps a signal's exit code and lines when the signal cancelled the request first", async () => {
      closeReader(process.stdout);
      execute(async (options) => {
        deliverSignal('SIGTERM');
        requestCancel(options);
        // Output that was already on its way to the client.
        await options.onStdoutAsync!(Buffer.from('built-a\n'), options.request.requestId);
        return aborted(options);
      });
      await launchClientAsync(false);
      expect(stderr).toEqual([CANCELLING, CANCELLED]);
      expect(process.exitCode).toBe(143);
    });

    it('keeps the exit code of a result that arrived before the client found the reader gone', async () => {
      const written: string[] = [];
      closeReader(process.stderr, written);
      execute(async (options) => ({
        kind: 'result',
        result: {
          requestId: options.request.requestId,
          exitCode: 1,
          outcome: 'failure',
          aborted: false,
          errorMessage: 'Rush build failed.'
        }
      }));
      await launchClientAsync(false);
      expect(written).toEqual(['rush-client: Rush build failed.\n']);
      expect(process.exitCode).toBe(1);
    });

    it('still fails on an EPIPE that is not from its own output', async () => {
      execute(async () => {
        throw brokenPipe();
      });
      await expect(launchClientAsync(false)).rejects.toThrow('write EPIPE');
      expect(stderr).toEqual([]);
    });

    it('cancels the request in agent output when a status line finds the reader gone', async () => {
      const stdout: ClosingOutput = new ClosingOutput();
      const output: ClientOutput = new ClientOutput({ stdout, stderr: process.stderr });
      const renderer: AgentProgressRenderer = new AgentProgressRenderer({
        commandName: 'build',
        isTTY: false,
        columns: 80,
        write: (text: string) => output.stdout.write(text)
      });
      const lockfile: DaemonRestartReason = {
        kind: 'workspaceInputsChanged',
        installationFiles: ['common/config/rush/pnpm-lock.yaml']
      };
      execute(async (options) => {
        stdout.readerExited = true;
        // On a pipe, a new cause gets a status line at once; otherwise the next one is due every 25 s.
        await options.onQueuePositionAsync!(1, lockfile, { scriptCount: 1 });
        await abortedAsync(options.abortSignal!);
        requestCancel(options);
        return aborted(options);
      });
      await launchClientAsync(false, renderer, output);
      expect(stdout.text).toMatch(
        /^rush build · \d+\.\ds · sent to rushd; preparing the workspace graph [^\n]*\n$/
      );
      // The summary line can no longer be read, so the line on stderr is the only report.
      expect(stderr).toEqual([CLOSED_STDOUT]);
      expect(process.exitCode).toBe(141);
    });

    it("keeps the result's exit code in agent output when only the summary line finds the reader gone", async () => {
      const stdout: ClosingOutput = new ClosingOutput();
      const output: ClientOutput = new ClientOutput({ stdout, stderr: process.stderr });
      const renderer: AgentProgressRenderer = new AgentProgressRenderer({
        commandName: 'build',
        isTTY: false,
        columns: 80,
        write: (text: string) => output.stdout.write(text)
      });
      execute(async (options) => {
        // As for `rush-client build | head -1` on a request that takes less than 25 s.
        stdout.readerExited = true;
        return {
          kind: 'result',
          result: { requestId: options.request.requestId, exitCode: 0, outcome: 'success', aborted: false }
        };
      });
      await launchClientAsync(false, renderer, output);
      expect(stdout.text).toMatch(
        /^rush build · \d+\.\ds · sent to rushd; preparing the workspace graph [^\n]*\n$/
      );
      expect(stderr).toEqual([]);
      expect(process.exitCode).toBe(0);
    });
  });
});
