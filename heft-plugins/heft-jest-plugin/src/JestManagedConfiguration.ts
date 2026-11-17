// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Config } from '@jest/reporters';

const SUPPORTED_COVERAGE_REPORTERS: ReadonlySet<string> = new Set([
  'json',
  'json-summary',
  'lcov',
  'lcovonly',
  'html',
  'clover',
  'cobertura',
  'text',
  'text-summary'
]);

/**
 * The shared builtin coverage reporter policy for managed Jest shards.
 */
export function isSupportedCoverageReporter(reporter: string): boolean {
  return SUPPORTED_COVERAGE_REPORTERS.has(reporter);
}

/**
 * Rejects unsupported managed-shard settings without modifying the configuration.
 * Pass the resolved configuration; an omitted provider uses Jest's Babel default.
 * This preflight is not enabled by the Jest plugin until managed shard execution is integrated.
 */
export function validateManagedJestConfiguration(jestConfig: Config.InitialOptions): void {
  const unsupported: ReadonlyArray<keyof Config.InitialOptions> = [
    'testResultsProcessor',
    'projects',
    'preset',
    'runner',
    'testRunner',
    'filter',
    'outputFile',
    'json',
    'forceExit',
    'globalSetup',
    'globalTeardown'
  ];
  for (const property of unsupported) {
    if (jestConfig[property] !== undefined) {
      throw new Error(
        `Managed Jest sharding does not support "${property}". Remove it or run without "--shard-output-directory".`
      );
    }
  }
  if (
    jestConfig.reporters !== undefined &&
    (!Array.isArray(jestConfig.reporters) || jestConfig.reporters.some((reporter) => reporter !== 'default'))
  ) {
    throw new Error(
      'Managed Jest sharding supports only the default Heft reporter. Custom reporters may write shared ' +
        'output or report additional failures; use an unsharded run instead.'
    );
  }
  if (jestConfig.bail) {
    throw new Error('Managed Jest sharding does not support "bail": every scheduled test suite must finish.');
  }
  if (jestConfig.coverageThreshold !== undefined && !jestConfig.collectCoverage) {
    throw new Error(
      'Managed Jest coverageThreshold requires collectCoverage. "--disable-code-coverage" cannot bypass required thresholds.'
    );
  }
  if (jestConfig.collectCoverage && jestConfig.coverageProvider !== 'v8') {
    throw new Error(
      'Managed Jest coverage requires "coverageProvider": "v8". ' +
        "Babel coverage, including Jest's default provider, is not supported."
    );
  }
  if (
    jestConfig.coverageReporters?.some(
      (reporter) => typeof reporter !== 'string' || !isSupportedCoverageReporter(reporter)
    )
  ) {
    throw new Error(
      'Managed Jest sharding supports only builtin coverage reporters without options or output redirects.'
    );
  }
}
