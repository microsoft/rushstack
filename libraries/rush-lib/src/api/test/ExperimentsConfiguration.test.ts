// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';

import { ExperimentsConfiguration } from '../ExperimentsConfiguration';

const TEMP_FOLDER: string = path.join(__dirname, 'temp', ExperimentsConfiguration.name);
const EXPERIMENTS_JSON_PATH: string = path.join(TEMP_FOLDER, 'experiments.json');

describe(ExperimentsConfiguration.name, () => {
  beforeEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_FOLDER);
  });

  afterEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_FOLDER);
  });

  it('preserves legacy reporting behavior when the experiment file is absent', () => {
    const experimentsConfiguration: ExperimentsConfiguration = new ExperimentsConfiguration(
      EXPERIMENTS_JSON_PATH
    );

    expect(experimentsConfiguration.configuration.useRushReporter).toBeUndefined();
  });

  it('loads the Rush reporter opt-in', () => {
    JsonFile.save({ useRushReporter: true }, EXPERIMENTS_JSON_PATH);

    const experimentsConfiguration: ExperimentsConfiguration = new ExperimentsConfiguration(
      EXPERIMENTS_JSON_PATH
    );

    expect(experimentsConfiguration.configuration.useRushReporter).toBe(true);
  });

  it('keeps an explicit false value disabled', () => {
    JsonFile.save({ useRushReporter: false }, EXPERIMENTS_JSON_PATH);

    const experimentsConfiguration: ExperimentsConfiguration = new ExperimentsConfiguration(
      EXPERIMENTS_JSON_PATH
    );

    expect(experimentsConfiguration.configuration.useRushReporter).toBe(false);
  });

  it('rejects a non-boolean Rush reporter opt-in', () => {
    JsonFile.save({ useRushReporter: 'yes' }, EXPERIMENTS_JSON_PATH);

    expect(() => new ExperimentsConfiguration(EXPERIMENTS_JSON_PATH)).toThrow(/useRushReporter/);
  });
});
