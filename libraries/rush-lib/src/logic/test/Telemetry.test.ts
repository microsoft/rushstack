// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@rushstack/node-core-library';
import type { IReporterEmitEventInput, IReporterEventSink } from '@rushstack/rush-reporter';
import { ConsoleTerminalProvider } from '@rushstack/terminal';

import { RushConfiguration } from '../../api/RushConfiguration';
import { Rush } from '../../api/Rush';
import { Telemetry, type ITelemetryData, type ITelemetryMachineInfo } from '../Telemetry';
import { _getRushSessionLifecycleEmitter, RushSession } from '../../pluginFramework/RushSession';

class CapturingSink implements IReporterEventSink {
  public readonly inputs: IReporterEmitEventInput<unknown>[] = [];

  public emit<TPayload>(event: IReporterEmitEventInput<TPayload>): string {
    this.inputs.push(event);
    return `event-${this.inputs.length}`;
  }
}

function createFlushGate(): { promise: Promise<void>; release: () => void; reject: (error: Error) => void } {
  let release!: () => void;
  let rejectGate!: (error: Error) => void;
  const promise: Promise<void> = new Promise((resolve, reject) => {
    release = resolve;
    rejectGate = reject;
  });
  return { promise, release, reject: rejectGate };
}

describe(Telemetry.name, () => {
  const mockedJsonFileSave: jest.SpyInstance = jest.spyOn(JsonFile, 'save').mockImplementation(() => {
    /* don't actually write anything */
    return true;
  });

  beforeEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('adds data to store if telemetry is enabled', () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    const logData1: ITelemetryData = {
      name: 'testData1',
      durationInSeconds: 100,
      result: 'Succeeded',
      timestampMs: new Date().getTime(),
      platform: process.platform,
      rushVersion: Rush.version,
      machineInfo: {} as ITelemetryMachineInfo,
      performanceEntries: []
    };

    const logData2: ITelemetryData = {
      name: 'testData2',
      durationInSeconds: 100,
      result: 'Failed',
      timestampMs: new Date().getTime(),
      platform: process.platform,
      rushVersion: Rush.version,
      machineInfo: {} as ITelemetryMachineInfo,
      performanceEntries: []
    };

    telemetry.log(logData1);
    telemetry.log(logData2);
    expect(telemetry.store).toEqual([logData1, logData2]);
  });

  it('does not add data to store if telemetry is not enabled', () => {
    const filename: string = `${__dirname}/telemetry/telemetryNotEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    const logData: ITelemetryData = {
      name: 'testData',
      durationInSeconds: 100,
      result: 'Succeeded',
      timestampMs: new Date().getTime(),
      platform: process.platform,
      rushVersion: Rush.version
    };

    telemetry.log(logData);
    expect(telemetry.store).toEqual([]);
  });

  it('deletes data after flush', () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    const logData: ITelemetryData = {
      name: 'testData1',
      durationInSeconds: 100,
      result: 'Succeeded',
      timestampMs: new Date().getTime(),
      platform: process.platform,
      rushVersion: Rush.version,
      machineInfo: {} as ITelemetryMachineInfo,
      performanceEntries: []
    };

    telemetry.log(logData);
    telemetry.flush();
    expect(mockedJsonFileSave).toHaveBeenCalledTimes(1);
    expect(mockedJsonFileSave).toHaveBeenCalledWith(
      [logData],
      expect.stringMatching(/telemetry_.*\.json/),
      expect.anything()
    );
    expect(telemetry.store).toEqual([]);
  });

  it('populates default fields', () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    const logData: ITelemetryData = {
      name: 'testData1',
      durationInSeconds: 100,
      result: 'Succeeded'
    };

    telemetry.log(logData);
    const result: ITelemetryData = telemetry.store[0];
    expect(result.platform).toEqual(process.platform);
    expect(result.rushVersion).toEqual(Rush.version);
    expect(result.timestampMs).toBeDefined();
  });

  it('projects public shadow events into legacy telemetry without exposing command arguments', () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const sink: CapturingSink = new CapturingSink();
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false,
      reporter: { eventSink: sink, sessionId: 'telemetry-shadow' }
    });
    const emitter = _getRushSessionLifecycleEmitter(rushSession, { commandName: 'build' })!;
    emitter.emitCommandStarted({ commandName: 'build', argv: ['--auth-token=secret'] });
    emitter.emitOperationStatusChanged({ operationId: '@scope/project#_phase:build', status: 'success' });

    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    telemetry.log({
      name: 'build',
      durationInSeconds: 2,
      result: 'Succeeded',
      machineInfo: {} as ITelemetryMachineInfo,
      performanceEntries: []
    });

    expect(telemetry.store[0].reporterData).toMatchObject({
      commandName: 'build',
      result: 'succeeded',
      exitCode: 0,
      durationMs: 2000,
      operationStatusCounts: { success: 1 }
    });
    expect(JSON.stringify(telemetry.store[0].reporterData)).not.toContain('--auth-token=secret');
  });

  it('calls custom flush telemetry', async () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const gate = createFlushGate();
    const customFlushTelemetry: jest.Mock = jest.fn(() => gate.promise);
    rushSession.hooks.flushTelemetry.tapPromise('test', customFlushTelemetry);
    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    const logData: ITelemetryData = {
      name: 'testData1',
      durationInSeconds: 100,
      result: 'Succeeded'
    };

    telemetry.log(logData);
    telemetry.flush();
    expect(customFlushTelemetry).toHaveBeenCalledTimes(1);
    expect(customFlushTelemetry.mock.calls[0][0][0]).toEqual(expect.objectContaining(logData));

    let flushed: boolean = false;
    const completion: Promise<void> = telemetry.ensureFlushedAsync().then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);
    gate.release();
    await completion;
    expect(flushed).toBe(true);
    await telemetry.ensureFlushedAsync();
    expect(customFlushTelemetry).toHaveBeenCalledTimes(1);
    expect(telemetry.store).toEqual([]);
  });

  it('calls custom flush telemetry twice', async () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const firstGate = createFlushGate();
    const secondGate = createFlushGate();
    const customFlushTelemetry: jest.Mock = jest.fn()
      .mockImplementationOnce(() => firstGate.promise)
      .mockImplementationOnce(() => secondGate.promise);
    rushSession.hooks.flushTelemetry.tapPromise('test', customFlushTelemetry);
    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    const logData: ITelemetryData = {
      name: 'testData1',
      durationInSeconds: 100,
      result: 'Succeeded'
    };

    telemetry.log(logData);
    telemetry.flush();
    expect(customFlushTelemetry).toHaveBeenCalledTimes(1);
    expect(customFlushTelemetry.mock.calls[0][0][0]).toEqual(expect.objectContaining(logData));

    const logData2: ITelemetryData = {
      name: 'testData2',
      durationInSeconds: 200,
      result: 'Failed'
    };

    telemetry.log(logData2);
    telemetry.flush();
    expect(customFlushTelemetry).toHaveBeenCalledTimes(2);
    expect(customFlushTelemetry.mock.calls[1][0][0]).toEqual(expect.objectContaining(logData2));

    let flushed: boolean = false;
    const completion: Promise<void> = telemetry.ensureFlushedAsync().then(() => { flushed = true; });
    firstGate.release();
    await Promise.resolve();
    expect(flushed).toBe(false);
    secondGate.release();
    await completion;
    expect(flushed).toBe(true);
    await telemetry.ensureFlushedAsync();
    expect(customFlushTelemetry).toHaveBeenCalledTimes(2);
    expect(telemetry.store).toEqual([]);
  });

  it('reports a pending flush rejection once and releases it before a later public join', async () => {
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${__dirname}/telemetry/telemetryEnabled.json`
    );
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const gate = createFlushGate();
    rushSession.hooks.flushTelemetry.tapPromise('rejecting-flush', () => gate.promise);
    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    telemetry.log({ name: 'failed-flush', durationInSeconds: 1, result: 'Succeeded' });
    telemetry.flush();
    const failure: Error = new Error('telemetry upload failed');
    const rejected: Promise<void> = expect(telemetry.ensureFlushedAsync()).rejects.toBe(failure);
    gate.reject(failure);
    await rejected;
    await expect(telemetry.ensureFlushedAsync()).resolves.toBeUndefined();
    expect(telemetry.store).toEqual([]);
  });
});
