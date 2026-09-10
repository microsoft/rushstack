// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { EnvironmentConfiguration } from '@microsoft/rush-lib/lib/api/EnvironmentConfiguration';
import { JsonFile, PackageJsonLookup } from '@rushstack/node-core-library';

import { MinimalRushConfiguration } from '../MinimalRushConfiguration';

describe(MinimalRushConfiguration.name, () => {
  const originalArgv: string[] = process.argv;
  const originalRushTempFolder: string | undefined = process.env.RUSH_TEMP_FOLDER;
  const originalRushPreviewVersion: string | undefined = process.env.RUSH_PREVIEW_VERSION;
  const originalRushReporter: string | undefined = process.env.RUSH_REPORTER;

  afterEach(() => {
    jest.restoreAllMocks();
    process.argv = originalArgv;
    if (originalRushTempFolder === undefined) {
      delete process.env.RUSH_TEMP_FOLDER;
    } else {
      process.env.RUSH_TEMP_FOLDER = originalRushTempFolder;
    }
    if (originalRushPreviewVersion === undefined) {
      delete process.env.RUSH_PREVIEW_VERSION;
    } else {
      process.env.RUSH_PREVIEW_VERSION = originalRushPreviewVersion;
    }
    if (originalRushReporter === undefined) {
      delete process.env.RUSH_REPORTER;
    } else {
      process.env.RUSH_REPORTER = originalRushReporter;
    }
    EnvironmentConfiguration.reset();
  });

  describe('legacy rush config', () => {
    beforeEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue(path.join(__dirname, 'sandbox', 'legacy-repo', 'project'));
    });

    it('correctly loads the rush.json file', () => {
      const config: MinimalRushConfiguration =
        MinimalRushConfiguration.loadFromDefaultLocation() as MinimalRushConfiguration;
      expect(config.rushVersion).toEqual('2.5.0');
      expect(config.useRushReporter).toBe(false);
    });
  });

  describe('non-legacy rush config', () => {
    beforeEach(() => {
      jest.spyOn(process, 'cwd').mockReturnValue(path.join(__dirname, 'sandbox', 'repo', 'project'));
    });

    it('correctly loads the rush.json file', () => {
      const config: MinimalRushConfiguration =
        MinimalRushConfiguration.loadFromDefaultLocation() as MinimalRushConfiguration;
      expect(config.rushVersion).toEqual('4.0.0');
      expect(config.useRushReporter).toBe(true);
      expect(config.commonTempFolder).toBe(path.resolve(__dirname, 'sandbox', 'repo', 'common', 'temp'));
    });

    it('uses the normalized RUSH_TEMP_FOLDER override', () => {
      process.env.RUSH_TEMP_FOLDER = path.join(
        __dirname,
        'sandbox',
        'repo',
        'custom-temp',
        '..',
        'rush-temp'
      );
      EnvironmentConfiguration.reset();

      const config: MinimalRushConfiguration =
        MinimalRushConfiguration.loadFromDefaultLocation() as MinimalRushConfiguration;

      expect(config.commonTempFolder).toBe(path.resolve(__dirname, 'sandbox', 'repo', 'rush-temp'));
    });
  });

  it('preserves legacy discovery text and blank-line behavior exactly', () => {
    const legacyRepo: string = path.join(__dirname, 'sandbox', 'legacy-repo');
    const consoleLog: jest.SpiedFunction<typeof console.log> = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(PackageJsonLookup, 'loadOwnPackageJson').mockReturnValue({
      name: '@microsoft/rush',
      version: '2.5.0'
    });
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(legacyRepo, 'project'));
    process.argv = ['node', 'rush', 'build', '--verbose'];

    MinimalRushConfiguration.loadFromDefaultLocation();

    expect(consoleLog.mock.calls).toEqual([
      [`Found configuration in ${path.join(legacyRepo, 'rush.json')}`],
      ['']
    ]);
  });

  it('prints the legacy discovery line and blank line when rush.json is in the current folder', () => {
    const legacyRepo: string = path.join(__dirname, 'sandbox', 'legacy-repo');
    const consoleLog: jest.SpiedFunction<typeof console.log> = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(process, 'cwd').mockReturnValue(legacyRepo);
    process.argv = ['node', 'rush', 'build', '--verbose'];

    MinimalRushConfiguration.loadFromDefaultLocation();

    expect(consoleLog.mock.calls).toEqual([
      [`Found configuration in ${path.join(legacyRepo, 'rush.json')}`],
      ['']
    ]);
  });

  it.each<[string, string[], string | undefined, boolean]>([
    ['legacy', ['build', '--verbose'], undefined, true],
    ['explicit JSON', ['build', '--reporter=json'], undefined, false],
    ['explicit legacy', ['build', '--reporter=legacy'], undefined, true],
    ['emergency legacy', ['build', '--reporter=json'], 'legacy', true],
    ['help', ['build', '--reporter=json', '--help'], undefined, true],
    ['custom reporter', ['custom', '--reporter=junit'], undefined, true],
    ['custom flag', ['custom', '--reporter', '--verbose'], undefined, true],
    ['pass-through', ['build', '--', '--reporter=json'], undefined, true],
    ['quiet', ['--quiet', 'build'], undefined, false]
  ])('preserves discovery ownership when rush.json cannot load: %s', (name, args, reporter, visible) => {
    void name;
    const repo: string = path.join(__dirname, 'sandbox', 'legacy-repo');
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(repo, 'project'));
    jest.spyOn(JsonFile, 'load').mockImplementation(() => {
      throw new SyntaxError('Malformed rush.json');
    });
    process.argv = ['node', 'rush', ...args];
    if (reporter === undefined) {
      delete process.env.RUSH_REPORTER;
    } else {
      process.env.RUSH_REPORTER = reporter;
    }

    expect(MinimalRushConfiguration.loadFromDefaultLocation()).toBeUndefined();
    expect(consoleLog.mock.calls).toEqual(
      visible ? [[`Found configuration in ${path.join(repo, 'rush.json')}`], ['']] : []
    );
  });

  it('suppresses legacy discovery output for an explicit reporter', () => {
    const legacyRepo: string = path.join(__dirname, 'sandbox', 'legacy-repo');
    const consoleLog: jest.SpiedFunction<typeof console.log> = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(PackageJsonLookup, 'loadOwnPackageJson').mockReturnValue({
      name: '@microsoft/rush',
      version: '2.5.0'
    });

    it('uses the caller-owned discovery writer when rush.json cannot load', () => {
      const repo: string = path.join(__dirname, 'sandbox', 'legacy-repo');
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const writeLine = jest.fn();
      jest.spyOn(process, 'cwd').mockReturnValue(repo);
      jest.spyOn(JsonFile, 'load').mockImplementation(() => {
        throw new SyntaxError('Malformed rush.json');
      });
      process.argv = ['node', 'rush', 'build'];

      expect(MinimalRushConfiguration.loadFromDefaultLocation(writeLine)).toBeUndefined();
      expect(writeLine.mock.calls).toEqual([[`Found configuration in ${path.join(repo, 'rush.json')}`], ['']]);
      expect(consoleLog).not.toHaveBeenCalled();
    });
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(legacyRepo, 'project'));
    process.argv = ['node', 'rush', 'build', '--verbose', '--reporter=json'];

    MinimalRushConfiguration.loadFromDefaultLocation();

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('restores legacy discovery output under the emergency fallback', () => {
    const legacyRepo: string = path.join(__dirname, 'sandbox', 'legacy-repo');
    const consoleLog: jest.SpiedFunction<typeof console.log> = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(legacyRepo, 'project'));
    process.argv = ['node', 'rush', 'build', '--reporter=json'];
    process.env.RUSH_REPORTER = 'legacy';

    MinimalRushConfiguration.loadFromDefaultLocation();

    expect(consoleLog.mock.calls).toEqual([
      [`Found configuration in ${path.join(legacyRepo, 'rush.json')}`],
      ['']
    ]);
  });

  it.each(['json', 'ai', 'file'])(
    'keeps discovery off stdout when an incompatible engine rejects %s',
    (reporter) => {
      const legacyRepo: string = path.join(__dirname, 'sandbox', 'legacy-repo');
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      jest.spyOn(PackageJsonLookup, 'loadOwnPackageJson').mockReturnValue({
        name: '@microsoft/rush',
        version: '5.178.1'
      });
      jest.spyOn(process, 'cwd').mockReturnValue(path.join(legacyRepo, 'project'));
      delete process.env.RUSH_REPORTER;
      process.argv = ['node', 'rush', 'build', `--reporter=${reporter}`];

      MinimalRushConfiguration.loadFromDefaultLocation();

      expect(consoleLog).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['environment fallback', ['build', '--reporter=json'], 'legacy'],
    ['explicit legacy reporter', ['build', '--reporter=legacy'], undefined],
    ['help fallback', ['build', '--reporter=json', '--help'], undefined],
    ['cross-version fallback', ['build'], undefined]
  ])('restores legacy discovery output in an opted-in repository for %s', (testName, args, envValue) => {
    void testName;
    const repo: string = path.join(__dirname, 'sandbox', 'repo');
    const consoleLog: jest.SpiedFunction<typeof console.log> = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(repo, 'project'));
    process.argv = ['node', 'rush', ...args];
    if (envValue === undefined) {
      delete process.env.RUSH_REPORTER;
    } else {
      process.env.RUSH_REPORTER = envValue;
    }

    MinimalRushConfiguration.loadFromDefaultLocation();

    expect(consoleLog.mock.calls).toEqual([[`Found configuration in ${path.join(repo, 'rush.json')}`], ['']]);
  });

  it.each([
    ['custom reporter value', ['custom', '--reporter', 'junit']],
    ['value-less custom reporter flag', ['custom', '--reporter', '--verbose']],
    ['pass-through reporter flag', ['build', '--', '--reporter=json']]
  ])('preserves legacy discovery output for %s', (testName, args) => {
    void testName;
    const legacyRepo: string = path.join(__dirname, 'sandbox', 'legacy-repo');
    const consoleLog: jest.SpiedFunction<typeof console.log> = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(legacyRepo, 'project'));
    process.argv = ['node', 'rush', ...args];

    MinimalRushConfiguration.loadFromDefaultLocation();

    expect(consoleLog.mock.calls).toEqual([
      [`Found configuration in ${path.join(legacyRepo, 'rush.json')}`],
      ['']
    ]);
  });

  it('uses the effective preview version when deciding discovery ownership', () => {
    const repo: string = path.join(__dirname, 'sandbox', 'repo');
    const consoleLog: jest.SpiedFunction<typeof console.log> = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(PackageJsonLookup, 'loadOwnPackageJson').mockReturnValue({
      name: '@microsoft/rush',
      version: '5.178.1'
    });
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(repo, 'project'));
    process.argv = ['node', 'rush', 'build', '--reporter=json'];
    process.env.RUSH_PREVIEW_VERSION = '5.178.1';

    MinimalRushConfiguration.loadFromDefaultLocation();

    expect(consoleLog).not.toHaveBeenCalled();
  });
});
