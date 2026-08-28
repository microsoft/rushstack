// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';

import { Rush } from '../Rush';
import { RushConfiguration } from '../RushConfiguration';

const TEMP_FOLDER: string = path.join(__dirname, 'temp', 'RushConfigurationReporting');
const RUSH_JSON_PATH: string = path.join(TEMP_FOLDER, 'rush.json');

function writeRushJson(reporting?: unknown): void {
  JsonFile.save(
    {
      rushVersion: Rush.version,
      pnpmVersion: '10.0.0',
      projects: [],
      ...(reporting === undefined ? {} : { reporting })
    },
    RUSH_JSON_PATH
  );
}

describe('RushConfiguration reporting configuration', () => {
  beforeEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_FOLDER);
  });

  afterEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_FOLDER);
  });

  it('defaults agent environment variables to an empty array', () => {
    writeRushJson();

    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(RUSH_JSON_PATH);

    expect(rushConfiguration.reportingConfiguration.agentEnvironmentVariables).toEqual([]);
  });

  it('loads configured agent environment variables', () => {
    writeRushJson({
      agentEnvironmentVariables: ['MY_AGENT_CLI', 'ANOTHER_AGENT']
    });

    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(RUSH_JSON_PATH);

    expect(rushConfiguration.reportingConfiguration.agentEnvironmentVariables).toEqual([
      'MY_AGENT_CLI',
      'ANOTHER_AGENT'
    ]);
  });

  it('rejects invalid agent environment variables', () => {
    writeRushJson({
      agentEnvironmentVariables: ['MY_AGENT_CLI', 123]
    });

    expect(() => RushConfiguration.loadFromConfigurationFile(RUSH_JSON_PATH)).toThrow(
      /agentEnvironmentVariables/
    );
  });

  it('rejects unsupported reporting settings', () => {
    writeRushJson({
      agentEnvironmentVariables: [],
      defaultReporter: 'ai'
    });

    expect(() => RushConfiguration.loadFromConfigurationFile(RUSH_JSON_PATH)).toThrow(/defaultReporter/);
  });
});
