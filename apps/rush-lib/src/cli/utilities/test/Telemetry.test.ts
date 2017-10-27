// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import {
  RushConfiguration,
  rushVersion
} from '../../../index';
import {
  default as Telemetry,
  ITelemetryData
 } from '../Telemetry';

describe('Telemetry', () => {
  it('adds data to store if telemetry is enabled', () => {
    const filename: string = path.resolve(path.join(__dirname, './telemetry/telemetryEnabled.json'));
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename, false);
    const telemetry: Telemetry = new Telemetry(rushConfig);
    const logData1: ITelemetryData = {
      name: 'testData1',
      duration: 100,
      result: 'Succeeded',
      timestamp: new Date().getTime(),
      platform: process.platform,
      rushVersion: rushVersion
    };

    const logData2: ITelemetryData = {
      name: 'testData2',
      duration: 100,
      result: 'Failed',
      timestamp: new Date().getTime(),
      platform: process.platform,
      rushVersion: rushVersion
    };

    telemetry.log(logData1);
    telemetry.log(logData2);
    assert.deepEqual(telemetry.store, [logData1, logData2]);
  });

  it('does not add data to store if telemetry is not enabled', () => {
    const filename: string = path.resolve(path.join(__dirname, './telemetry/telemetryNotEnabled.json'));
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename, false);
    const telemetry: Telemetry = new Telemetry(rushConfig);
    const logData: ITelemetryData = {
      name: 'testData',
      duration: 100,
      result: 'Succeeded',
      timestamp: new Date().getTime(),
      platform: process.platform,
      rushVersion: rushVersion
    };

    telemetry.log(logData);
    assert.deepEqual(telemetry.store, []);
  });

  it('deletes data after flush', () => {
    const filename: string = path.resolve(path.join(__dirname, './telemetry/telemetryEnabled.json'));
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename, false);
    const telemetry: Telemetry = new Telemetry(rushConfig);
    const logData: ITelemetryData = {
      name: 'testData1',
      duration: 100,
      result: 'Succeeded',
      timestamp: new Date().getTime(),
      platform: process.platform,
      rushVersion: rushVersion
    };

    telemetry.log(logData);
    let logFile: string;
    let dataToWrite: string;
    telemetry.flush((file, data) => {
      logFile = file;
      dataToWrite = data;
    });
    assert.isDefined(logFile!.match(/telemetry_.*\.json/));
    assert.deepEqual(dataToWrite!, JSON.stringify([logData]));
    assert.deepEqual(telemetry.store, []);
  });

  it('populates default fields', () => {
    const filename: string = path.resolve(path.join(__dirname, './telemetry/telemetryEnabled.json'));
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename, false);
    const telemetry: Telemetry = new Telemetry(rushConfig);
    const logData: ITelemetryData = {
      name: 'testData1',
      duration: 100,
      result: 'Succeeded'
    };

    telemetry.log(logData);
    const result: ITelemetryData = telemetry.store[0];
    assert.equal(result.platform, process.platform);
    assert.equal(result.rushVersion, rushVersion);
    assert.isDefined(result.timestamp);
  });
});