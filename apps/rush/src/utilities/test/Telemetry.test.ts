// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import {
  RushConfiguration
} from '@microsoft/rush-lib';

import {
  default as Telemetry,
  ITelemetryData
 } from '../Telemetry';

describe('Telemetry', () => {
  it('adds data to store if telemetry is enabled', () => {
    const filename: string = path.resolve(path.join(__dirname, './telemetry/telemetryEnabled.json'));
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const telemetry: Telemetry = new Telemetry(rushConfig);
    const logData1: ITelemetryData = {
      name: 'testData1',
      duration: 100,
      result: 'Succeeded'
    };

    const logData2: ITelemetryData = {
      name: 'testData2',
      duration: 100,
      result: 'Failed'
    };

    telemetry.log(logData1);
    telemetry.log(logData2);
    assert.deepEqual(telemetry.store, [logData1, logData2]);
  });

  it('does not add data to store if telemetry is not enabled', () => {
    const filename: string = path.resolve(path.join(__dirname, './telemetry/telemetryNotEnabled.json'));
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const telemetry: Telemetry = new Telemetry(rushConfig);
    const logData: ITelemetryData = {
      name: 'testData',
      duration: 100,
      result: 'Succeeded'
    };

    telemetry.log(logData);
    assert.deepEqual(telemetry.store, []);
  });

  it('deletes data after flush', () => {
    const filename: string = path.resolve(path.join(__dirname, './telemetry/telemetryEnabled.json'));
    const rushConfig: RushConfiguration = RushConfiguration.loadFromConfigurationFile(filename);
    const telemetry: Telemetry = new Telemetry(rushConfig);
    const logData: ITelemetryData = {
      name: 'testData1',
      duration: 100,
      result: 'Succeeded'
    };

    telemetry.log(logData);
    let logFile: string;
    let dataToWrite: string;
    telemetry.flush((file, data) => {
      logFile = file;
      dataToWrite = data;
    });
    assert.isDefined(logFile.match(/telemetry_.*\.json/));
    assert.deepEqual(dataToWrite, JSON.stringify([logData]));
  });
});