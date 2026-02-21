// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '@rushstack/node-core-library';
import { ConsoleTerminalProvider } from '@rushstack/terminal';

import { RushConfiguration } from '../../api/RushConfiguration.ts';
import { Rush } from '../../api/Rush.ts';
import { Telemetry, type ITelemetryData, type ITelemetryMachineInfo } from '../Telemetry.ts';
import { RushSession } from '../../pluginFramework/RushSession.ts';

interface ITelemetryPrivateMembers extends Omit<Telemetry, '_flushAsyncTasks'> {
  _flushAsyncTasks: Map<symbol, Promise<void>>;
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

  it('calls custom flush telemetry', async () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const customFlushTelemetry: jest.Mock = jest.fn();
    rushSession.hooks.flushTelemetry.tap('test', customFlushTelemetry);
    const telemetry: ITelemetryPrivateMembers = new Telemetry(
      rushConfig,
      rushSession
    ) as unknown as ITelemetryPrivateMembers;
    const logData: ITelemetryData = {
      name: 'testData1',
      durationInSeconds: 100,
      result: 'Succeeded'
    };

    telemetry.log(logData);
    telemetry.flush();
    expect(customFlushTelemetry).toHaveBeenCalledTimes(1);
    expect(customFlushTelemetry.mock.calls[0][0][0]).toEqual(expect.objectContaining(logData));

    await telemetry.ensureFlushedAsync();

    // Ensure the tasks get cleaned up
    expect(telemetry._flushAsyncTasks.size).toEqual(0);
  });

  it('calls custom flush telemetry twice', async () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const customFlushTelemetry: jest.Mock = jest.fn();
    rushSession.hooks.flushTelemetry.tap('test', customFlushTelemetry);
    const telemetry: ITelemetryPrivateMembers = new Telemetry(
      rushConfig,
      rushSession
    ) as unknown as ITelemetryPrivateMembers;
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

    await telemetry.ensureFlushedAsync();

    // Ensure the tasks get cleaned up
    expect(telemetry._flushAsyncTasks.size).toEqual(0);
  });
});
