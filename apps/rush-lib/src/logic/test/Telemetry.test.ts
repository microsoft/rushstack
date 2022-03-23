// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
import { Rush } from '../../api/Rush';
import { Telemetry, ITelemetryData, TelemetryResult } from '../Telemetry';
import { RushSession } from '../../pluginFramework/RushSession';
import { ConsoleTerminalProvider } from '@rushstack/node-core-library';

describe(Telemetry.name, () => {
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
      duration: 100,
      result: TelemetryResult.Succeeded,
      timestamp: new Date().getTime(),
      platform: process.platform,
      rushVersion: Rush.version
    };

    const logData2: ITelemetryData = {
      name: 'testData2',
      duration: 100,
      result: TelemetryResult.Failed,
      timestamp: new Date().getTime(),
      platform: process.platform,
      rushVersion: Rush.version
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
      duration: 100,
      result: TelemetryResult.Succeeded,
      timestamp: new Date().getTime(),
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
      duration: 100,
      result: TelemetryResult.Succeeded,
      timestamp: new Date().getTime(),
      platform: process.platform,
      rushVersion: Rush.version
    };

    telemetry.log(logData);
    let logFile: string;
    let dataToWrite: string;
    telemetry.flush((file, data) => {
      logFile = file;
      dataToWrite = data;
    });
    expect(logFile!.match(/telemetry_.*\.json/)).toBeDefined();
    expect(dataToWrite!).toEqual(JSON.stringify([logData]));
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
      duration: 100,
      result: TelemetryResult.Succeeded
    };

    telemetry.log(logData);
    const result: ITelemetryData = telemetry.store[0];
    expect(result.platform).toEqual(process.platform);
    expect(result.rushVersion).toEqual(Rush.version);
    expect(result.timestamp).toBeDefined();
  });

  it('calls custom flush telemetry', () => {
    const filename: string = `${__dirname}/telemetry/telemetryEnabled.json`;
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const rushSession: RushSession = new RushSession({
      terminalProvider: new ConsoleTerminalProvider(),
      getIsDebugMode: () => false
    });
    const customFlushTelemetry: jest.Mock = jest.fn();
    rushSession.hooks.flushTelemetry.tap('test', customFlushTelemetry);
    const telemetry: Telemetry = new Telemetry(rushConfig, rushSession);
    const logData: ITelemetryData = {
      name: 'testData1',
      duration: 100,
      result: TelemetryResult.Succeeded
    };

    telemetry.log(logData);
    telemetry.flush();
    expect(customFlushTelemetry).toHaveBeenCalledTimes(1);
    expect(customFlushTelemetry.mock.calls[0][0][0]).toEqual(expect.objectContaining(logData));
  });
});
