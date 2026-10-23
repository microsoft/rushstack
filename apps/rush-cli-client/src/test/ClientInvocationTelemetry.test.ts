// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  ClientInvocationTelemetry,
  type IClientInvocationContext,
  type IClientInvocationEvent
} from '../ClientInvocationTelemetry';

const FOLDER: string = path.resolve(__dirname, '../../temp/test/client-invocation-telemetry');
const RECEIPTS: string = `${FOLDER}/receipts`;
const ORIGINAL_TAG: string | undefined = process.env.RUSHD_TELEMETRY_TAG;

function writeConfiguration(configuration: Record<string, unknown>): void {
  fs.mkdirSync(`${FOLDER}/common/config/rush-client`, { recursive: true });
  fs.writeFileSync(`${FOLDER}/common/config/rush-client/telemetry.json`, JSON.stringify(configuration));
}

function initialize(): ClientInvocationTelemetry {
  const telemetry: ClientInvocationTelemetry | undefined = ClientInvocationTelemetry.initialize(
    `${FOLDER}/rush.json`,
    false
  );
  if (!telemetry) throw new Error('Expected configured telemetry');
  return telemetry;
}

function readReceipt(): IClientInvocationEvent {
  const names: string[] = fs.readdirSync(RECEIPTS).filter((name: string) => name.endsWith('.json'));
  expect(names).toHaveLength(1);
  return JSON.parse(fs.readFileSync(`${RECEIPTS}/${names[0]}`, 'utf8'));
}

describe(ClientInvocationTelemetry.name, () => {
  let once: jest.SpyInstance;
  let child: childProcess.ChildProcess;

  beforeEach(() => {
    fs.mkdirSync(FOLDER, { recursive: true });
    once = jest.spyOn(process, 'once').mockReturnValue(process);
    child = new childProcess.ChildProcess();
    jest.spyOn(jest.requireActual<typeof childProcess>('node:child_process'), 'spawn').mockReturnValue(child);
    jest.spyOn(child, 'unref').mockImplementation(() => {});
    jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    writeConfiguration({ reporterPath: 'reporter.cjs', logFolder: 'receipts' });
    fs.writeFileSync(
      `${FOLDER}/reporter.cjs`,
      "require('node:fs').writeFileSync('reporter-called',process.argv[3]);"
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (ORIGINAL_TAG === undefined) delete process.env.RUSHD_TELEMETRY_TAG;
    else process.env.RUSHD_TELEMETRY_TAG = ORIGINAL_TAG;
    fs.rmSync(FOLDER, { recursive: true, force: true });
  });

  function onExit(code: number): void {
    const call: unknown[] | undefined = once.mock.calls.find(([event]) => event === 'exit');
    const handler: ((exitCode: number) => void) | undefined = call?.[1] as
      | ((exitCode: number) => void)
      | undefined;
    if (!handler) throw new Error('Missing exit hook');
    handler(code);
  }

  it('leaves repositories without a telemetry configuration unchanged', () => {
    expect(ClientInvocationTelemetry.initialize(undefined, false)).toBeUndefined();
    expect(ClientInvocationTelemetry.initialize(`${FOLDER}/other/rush.json`, false)).toBeUndefined();
    expect(once).not.toHaveBeenCalled();
  });

  it('honors the configured upload opt-out before attaching hooks or writing a receipt', () => {
    writeConfiguration({
      reporterPath: 'reporter.cjs',
      logFolder: 'receipts',
      disabledEnvironmentVariable: 'DISABLE_TELEMETRY_UPLOAD'
    });
    const old: string | undefined = process.env.DISABLE_TELEMETRY_UPLOAD;
    process.env.DISABLE_TELEMETRY_UPLOAD = '1';
    try {
      expect(ClientInvocationTelemetry.initialize(`${FOLDER}/rush.json`, false)).toBeUndefined();
      expect(once).not.toHaveBeenCalled();
    } finally {
      if (old === undefined) delete process.env.DISABLE_TELEMETRY_UPLOAD;
      else process.env.DISABLE_TELEMETRY_UPLOAD = old;
    }
  });

  it('attaches hooks and persists a normal invocation when the reporter status is malformed', () => {
    fs.mkdirSync(RECEIPTS, { recursive: true });
    fs.writeFileSync(`${RECEIPTS}/.reporter-status`, '{"success":');
    const telemetry: ClientInvocationTelemetry = initialize();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('telemetry reporter status is unavailable')
    );
    expect(once).toHaveBeenCalledWith('beforeExit', expect.any(Function));
    expect(once).toHaveBeenCalledWith('exit', expect.any(Function));
    telemetry.selectRoute('build', false, 'explicit-native');
    onExit(0);
    expect(readReceipt()).toMatchObject({
      command: 'build',
      route: 'native',
      routeReason: 'explicit-native',
      exitCode: 0
    });
    expect(childProcess.spawn).toHaveBeenCalledTimes(1);
  });

  it('does not publish receipts or targets when collection is disabled before command return', () => {
    const previous: string | undefined = process.env.DISABLE_TELEMETRY_UPLOAD;
    process.env.DISABLE_TELEMETRY_UPLOAD = '0';
    writeConfiguration({
      reporterPath: 'reporter.cjs',
      logFolder: 'receipts',
      disabledEnvironmentVariable: 'DISABLE_TELEMETRY_UPLOAD'
    });
    try {
      initialize().selectRoute('build', true);
      process.env.DISABLE_TELEMETRY_UPLOAD = '1';
      onExit(0);
      expect(fs.existsSync(RECEIPTS)).toBe(false);
      expect(childProcess.spawn).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.DISABLE_TELEMETRY_UPLOAD;
      else process.env.DISABLE_TELEMETRY_UPLOAD = previous;
    }
  });

  it('persists the original normalized relative cwd hash when the cwd changes after initialization', () => {
    const originalCwd: string = path.join(FOLDER, 'projects', 'original-cwd');
    const laterCwd: string = path.join(FOLDER, 'projects', 'later-cwd');
    const cwd: jest.SpyInstance = jest.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    const telemetry: ClientInvocationTelemetry = initialize();
    cwd.mockReturnValue(laterCwd);
    telemetry.selectRoute('build', false, 'explicit-native');
    onExit(0);
    const event: IClientInvocationEvent = readReceipt();
    const originalRelativeCwd: string = path.relative(FOLDER, originalCwd).split(path.sep).join('/');
    const laterRelativeCwd: string = path.relative(FOLDER, laterCwd).split(path.sep).join('/');
    expect(event.cwdHash).toBe(createHash('sha256').update(originalRelativeCwd).digest('hex'));
    expect(event.cwdHash).not.toBe(createHash('sha256').update(laterRelativeCwd).digest('hex'));
    const receipt: string = JSON.stringify(event);
    expect(receipt).not.toContain(FOLDER);
    expect(receipt).not.toContain(originalRelativeCwd);
    expect(receipt).not.toContain(laterRelativeCwd);
  });

  it('keeps intentional in-process routing out of the fallback population', () => {
    const telemetry: ClientInvocationTelemetry = initialize();
    telemetry.selectRoute('test', false, 'custom-command');
    onExit(0);
    const event: IClientInvocationEvent = readReceipt();
    expect(event.route).toBe('native');
    expect(event.routeReason).toBe('custom-command');
    expect(event.operationsReexecuted).toBeUndefined();
    expect(event.attempts).toHaveLength(1);
    expect(Number.isSafeInteger(event.elapsedMs)).toBe(true);
  });

  it('correlates failed startup and safe native fallback without replaying daemon operations', () => {
    process.env.RUSHD_TELEMETRY_TAG = 'benchmark-label';
    const telemetry: ClientInvocationTelemetry = initialize();
    telemetry.selectRoute('build', true);
    const firstId: string = telemetry.attemptId;
    telemetry.beginFallback('startupFailed');
    const environment: Readonly<Record<string, string | undefined>> = telemetry.getEnvironment({});
    const context: IClientInvocationContext = JSON.parse(
      environment.RUSHD_TELEMETRY_TAG!.slice('rush-client-v1:'.length)
    );
    expect(context.originalTag).toBe('benchmark-label');
    expect(context.attemptId).not.toBe(firstId);
    expect(context.route).toBe('fallback');
    onExit(7);
    const event: IClientInvocationEvent = readReceipt();
    expect(event.invocationId).toBe(context.invocationId);
    expect(event.exitCode).toBe(7);
    expect(event.operationsReexecuted).toBe(0);
    expect(event.attempts.map((attempt) => attempt.backend)).toEqual(['daemon', 'native']);
    expect(event.attempts.reduce((sum, attempt) => sum + attempt.elapsedMs, 0)).toBe(event.elapsedMs);
    expect(JSON.stringify(event)).not.toContain('benchmark-label');
    expect(JSON.stringify(event)).not.toContain(FOLDER);
  });

  it('persists an explicit-exit failure once, with its actual exit code', () => {
    initialize().selectRoute('build', true);
    onExit(1);
    onExit(1);
    expect(readReceipt().exitCode).toBe(1);
    expect(childProcess.spawn).toHaveBeenCalledTimes(1);
  });

  it('hashes routed arguments, not client-only native admission controls', () => {
    const args: string[] = ['build', '-t', 'target'];
    jest.replaceProperty(process, 'argv', ['node', 'client', '--no-daemon', ...args]);
    initialize().selectRoute('build', false, 'explicit-native', args);
    onExit(0);
    expect(readReceipt().scopeHash).toBe(createHash('sha256').update(JSON.stringify(args)).digest('hex'));
  });

  it('starts the reporter without awaiting network delivery or inheriting terminal pipes', () => {
    initialize().selectRoute('build', true);
    onExit(0);
    expect(childProcess.spawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('reporter.cjs'), '--invocation', expect.stringContaining('.json')],
      expect.objectContaining({ detached: true, stdio: ['ignore', 'ignore', expect.any(Number)] })
    );
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('retains the real command outcome when the reporter cannot be started', () => {
    jest.mocked(childProcess.spawn).mockImplementation(() => {
      throw new Error('reporter unavailable');
    });
    initialize().selectRoute('build', true);
    expect(() => onExit(7)).not.toThrow();
    expect(readReceipt().exitCode).toBe(7);
    expect(
      JSON.parse(fs.readFileSync(`${RECEIPTS}/${readReceipt().invocationId}.json.delivery-target`, 'utf8'))
    ).toEqual({ kind: 'upload' });
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('reporter unavailable'));
  });

  it('persists the delivery target before launching the background reporter', () => {
    let observed: unknown;
    jest.mocked(childProcess.spawn).mockImplementationOnce(() => {
      const target: string = `${RECEIPTS}/${readReceipt().invocationId}.json.delivery-target`;
      observed = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : undefined;
      return child;
    });
    initialize().selectRoute('build', true);
    onExit(0);
    expect(observed).toEqual({ kind: 'upload' });
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('does not publish an unclassified receipt when persisting its target fails', () => {
    jest.spyOn(jest.requireActual<typeof fs>('node:fs'), 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('target unavailable');
    });
    initialize().selectRoute('build', true);
    expect(() => onExit(7)).not.toThrow();
    expect(fs.readdirSync(RECEIPTS)).toHaveLength(0);
    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('target unavailable'));
  });

  it('retains the original local destination even when the reporter cannot start and the environment changed', () => {
    const previous: string | undefined = process.env.CLIENT_TELEMETRY_LOCAL_FOLDER;
    process.env.CLIENT_TELEMETRY_LOCAL_FOLDER = 'original-local';
    writeConfiguration({
      reporterPath: 'reporter.cjs',
      logFolder: 'receipts',
      localFolderEnvironmentVariable: 'CLIENT_TELEMETRY_LOCAL_FOLDER'
    });
    try {
      const telemetry: ClientInvocationTelemetry = initialize();
      process.env.CLIENT_TELEMETRY_LOCAL_FOLDER = 'different-local';
      jest.mocked(childProcess.spawn).mockImplementationOnce(() => {
        throw new Error('reporter unavailable');
      });
      telemetry.selectRoute('build', true);
      expect(() => onExit(7)).not.toThrow();
      const event: IClientInvocationEvent = readReceipt();
      expect(event.exitCode).toBe(7);
      expect(
        JSON.parse(fs.readFileSync(`${RECEIPTS}/${event.invocationId}.json.delivery-target`, 'utf8'))
      ).toEqual({ kind: 'local-only', folder: path.resolve(FOLDER, 'original-local') });
      expect(JSON.stringify(event)).not.toContain('original-local');
    } finally {
      if (previous === undefined) delete process.env.CLIENT_TELEMETRY_LOCAL_FOLDER;
      else process.env.CLIENT_TELEMETRY_LOCAL_FOLDER = previous;
    }
  });

  it('rejects invalid local-folder environment configuration instead of selecting upload delivery', () => {
    for (const localFolderEnvironmentVariable of [42, '']) {
      writeConfiguration({
        reporterPath: 'reporter.cjs',
        logFolder: 'receipts',
        localFolderEnvironmentVariable
      });
      expect(ClientInvocationTelemetry.initialize(`${FOLDER}/rush.json`, false)).toBeUndefined();
    }
    expect(once).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('localFolderEnvironmentVariable')
    );
  });

  it('captures attribution when work starts, rather than when a queued record is uploaded', () => {
    const original: string | undefined = process.env.COPILOT_AGENT_SESSION_ID;
    process.env.COPILOT_AGENT_SESSION_ID = 'original-session';
    try {
      initialize().selectRoute('build', true);
      process.env.COPILOT_AGENT_SESSION_ID = 'later-session';
      onExit(0);
      const event: IClientInvocationEvent = readReceipt();
      expect(event.agentSessionId).toBe('original-session');
      expect(event.machine.os).toBe(process.platform);
      expect(event.machine.totalMemoryBytes).toBeGreaterThan(0);
    } finally {
      if (original === undefined) delete process.env.COPILOT_AGENT_SESSION_ID;
      else process.env.COPILOT_AGENT_SESSION_ID = original;
    }
  });

  it('rejects reporter paths outside the repository without failing the command', () => {
    writeConfiguration({ reporterPath: '../outside.cjs', logFolder: 'receipts' });
    const stderr: jest.SpyInstance = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(ClientInvocationTelemetry.initialize(`${FOLDER}/rush.json`, false)).toBeUndefined();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('paths inside the repository'));
    expect(once).not.toHaveBeenCalled();
  });
});
