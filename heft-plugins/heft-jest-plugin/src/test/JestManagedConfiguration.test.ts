// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Config } from '@jest/reporters';

import { isSupportedCoverageReporter, validateManagedJestConfiguration } from '../JestManagedConfiguration';

describe('validateManagedJestConfiguration', () => {
  it.each<[keyof Config.InitialOptions, Config.InitialOptions]>([
    ['testResultsProcessor', { testResultsProcessor: 'processor' }],
    ['projects', { projects: ['another-project'] }],
    ['projects', { projects: [] }],
    ['preset', { preset: 'preset' }],
    ['runner', { runner: 'custom-runner' }],
    ['testRunner', { testRunner: 'jest-circus/runner' }],
    ['filter', { filter: 'custom-filter' }],
    ['outputFile', { outputFile: '../shared.json' }],
    ['outputFile', { outputFile: '' }],
    ['json', { json: true }],
    ['json', { json: false }],
    ['forceExit', { forceExit: true }],
    ['forceExit', { forceExit: false }],
    ['globalSetup', { globalSetup: '<rootDir>/global-setup.js' }],
    ['globalTeardown', { globalTeardown: '<rootDir>/global-teardown.js' }]
  ])('rejects explicitly configured %s: %j', (property, config) => {
    expect(() => validateManagedJestConfiguration(config)).toThrow(
      `Managed Jest sharding does not support "${property}". Remove it or run without "--shard-output-directory".`
    );
    expect(() => validateManagedJestConfiguration({ ...config, [property]: undefined })).not.toThrow();
  });

  it.each<Config.InitialOptions>([
    { reporters: ['custom-reporter'] },
    { reporters: ['default', 'summary'] },
    { reporters: [['default', {}]] },
    { reporters: [['default', { outputFile: '../shared' }]] }
  ])('rejects custom reporters and reporter options: %j', (config) => {
    expect(() => validateManagedJestConfiguration(config)).toThrow(
      'Managed Jest sharding supports only the default Heft reporter. Custom reporters may write shared ' +
        'output or report additional failures; use an unsharded run instead.'
    );
  });

  it.each<Config.InitialOptions>([{ bail: true }, { bail: 1 }, { bail: 2 }])(
    'rejects early termination: %j',
    (config) => {
      expect(() => validateManagedJestConfiguration(config)).toThrow(
        'Managed Jest sharding does not support "bail": every scheduled test suite must finish.'
      );
    }
  );

  it.each([undefined, false])('rejects thresholds with collectCoverage=%s', (collectCoverage) => {
    expect(() =>
      validateManagedJestConfiguration({
        collectCoverage,
        coverageThreshold: { global: { lines: 90 } }
      })
    ).toThrow(
      'Managed Jest coverageThreshold requires collectCoverage. "--disable-code-coverage" cannot bypass required thresholds.'
    );
  });

  it.each<Config.InitialOptions>([
    { collectCoverage: true },
    { collectCoverage: true, collectCoverageFrom: [] },
    { collectCoverage: true, coverageProvider: 'babel' },
    { collectCoverage: true, coverageProvider: 'babel', collectCoverageFrom: [] }
  ])('requires collection patterns for default or explicit Babel coverage: %j', (config) => {
    expect(() => validateManagedJestConfiguration(config)).toThrow(
      'Managed Jest Babel coverage requires nonempty "collectCoverageFrom" to validate instrumentation completeness.'
    );
  });

  it.each<Config.InitialOptions>([
    { coverageReporters: ['html-spa'] },
    { coverageReporters: ['teamcity'] },
    { coverageReporters: ['none'] },
    { coverageReporters: ['text-lcov'] },
    { coverageReporters: [['json', {}]] },
    { coverageReporters: [['json', { file: '../shared.json' }]] }
  ])('rejects unsupported coverage reporters and options even without collection: %j', (config) => {
    expect(() => validateManagedJestConfiguration(config)).toThrow(
      'Managed Jest sharding supports only builtin coverage reporters without options or output redirects.'
    );
  });

  it.each<[string, RegExp]>([
    ['{"reporters":"default"}', /supports only the default Heft reporter/],
    ['{"coverageReporters":["custom"]}', /builtin coverage reporters without options or output redirects/],
    ['{"preset":null}', /does not support "preset"/],
    ['{"globalSetup":null}', /does not support "globalSetup"/],
    ['{"globalTeardown":null}', /does not support "globalTeardown"/]
  ])('rejects unsupported values loaded from JSON: %s', (json, diagnostic) => {
    const config: Config.InitialOptions = JSON.parse(json);
    expect(() => validateManagedJestConfiguration(config)).toThrow(diagnostic);
  });

  it.each<Config.InitialOptions>([
    {},
    { reporters: undefined, bail: undefined, coverageThreshold: undefined, coverageReporters: undefined },
    { reporters: [], bail: false },
    { reporters: ['default'], bail: 0 },
    { collectCoverage: false, coverageProvider: 'babel', collectCoverageFrom: [] },
    { collectCoverage: true, collectCoverageFrom: ['src/**/*.ts'] },
    {
      collectCoverage: true,
      coverageProvider: 'babel',
      collectCoverageFrom: ['src/**/*.ts'],
      coverageThreshold: { global: { lines: 100 } }
    },
    { collectCoverage: true, coverageProvider: 'v8' },
    {
      collectCoverage: true,
      coverageProvider: 'v8',
      collectCoverageFrom: [],
      coverageThreshold: { global: { lines: 100 } },
      coverageReporters: []
    }
  ])('accepts supported defaults and coverage settings: %j', (config) => {
    expect(() => validateManagedJestConfiguration(config)).not.toThrow();
  });

  it('does not mutate accepted or rejected configuration', () => {
    const config: Config.InitialOptions = {
      reporters: ['default'],
      collectCoverage: true,
      coverageProvider: 'babel',
      collectCoverageFrom: ['src/**/*.ts'],
      coverageThreshold: { global: { lines: 100 } },
      coverageReporters: ['json', 'lcov']
    };
    const original: Config.InitialOptions = JSON.parse(JSON.stringify(config));
    Object.freeze(config.reporters);
    Object.freeze(config.collectCoverageFrom);
    Object.freeze(config.coverageThreshold!.global);
    Object.freeze(config.coverageThreshold);
    Object.freeze(config.coverageReporters);
    Object.freeze(config);

    expect(() => validateManagedJestConfiguration(config)).not.toThrow();
    expect(config).toEqual(original);

    const rejected: Config.InitialOptions = Object.freeze({ ...config, bail: true });
    expect(() => validateManagedJestConfiguration(rejected)).toThrow(/does not support "bail"/);
    expect(rejected).toEqual({ ...original, bail: true });
  });
});

describe('managed coverage reporter policy', () => {
  it.each<NonNullable<Config.InitialOptions['coverageReporters']>[number]>([
    'json',
    'json-summary',
    'lcov',
    'lcovonly',
    'html',
    'clover',
    'cobertura',
    'text',
    'text-summary'
  ])('accepts the shared builtin policy in preflight: %s', (reporter) => {
    expect(() => validateManagedJestConfiguration({ coverageReporters: [reporter] })).not.toThrow();
  });

  it.each(['custom', '../json', 'JSON', 'html-spa', 'teamcity', 'none', 'text-lcov'])(
    'does not allow unsupported reporter names: %s',
    (reporter) => {
      expect(isSupportedCoverageReporter(reporter)).toBe(false);
    }
  );
});
