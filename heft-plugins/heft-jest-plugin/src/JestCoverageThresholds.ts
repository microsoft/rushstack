// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { AggregatedResult, BaseReporter, Config } from '@jest/reporters';
import { createEmptyTestResult, makeEmptyAggregatedTestResult } from '@jest/test-result';
import { readConfigs } from 'jest-config';
import type { CoverageMap } from 'istanbul-lib-coverage';

/**
 * Evaluates Jest thresholds against an already combined Istanbul map, without collecting coverage or writing reports.
 * Map paths must be absolute; threshold scopes are resolved relative to the build folder.
 * Jest logs threshold failures and the returned messages use build-folder-relative, slash-normalized paths.
 * Scopes that resolve to the same key are rejected rather than silently dropping a threshold.
 */
export async function evaluateThresholdsAsync(
  buildFolderPath: string,
  thresholds: Config.GlobalConfig['coverageThreshold'],
  map: CoverageMap
): Promise<string[]> {
  if (!thresholds) {
    return [];
  }

  const rootDir: string = path.resolve(buildFolderPath);
  const { CoverageReporter } = await import('@jest/reporters');
  const absoluteThresholds: NonNullable<Config.GlobalConfig['coverageThreshold']> = Object.create(null);
  const originalScopes: Map<string, string> = new Map();
  for (const [name, threshold] of Object.entries(thresholds)) {
    const resolvedName: string = path.resolve(rootDir, name);
    const suffix: string =
      (name.endsWith('/') || name.endsWith(path.sep)) && !resolvedName.endsWith(path.sep) ? path.sep : '';
    const absoluteName: string = name === 'global' ? name : `${resolvedName}${suffix}`;
    const previousScope: string | undefined = originalScopes.get(absoluteName);
    if (previousScope !== undefined) {
      throw new Error(
        `Jest coverage threshold scopes "${previousScope}" and "${name}" resolve to the same path.`
      );
    }
    originalScopes.set(absoluteName, name);
    absoluteThresholds[absoluteName] = threshold;
  }

  const { globalConfig } = await readConfigs(
    {
      $0: 'heft-jest-coverage-thresholds',
      _: [],
      config: JSON.stringify({
        rootDir,
        coverageThreshold: absoluteThresholds,
        coverageReporters: []
      }),
      // Inputs are already Istanbul maps, even when originally collected by V8.
      coverageProvider: 'babel',
      useStderr: true,
      runInBand: true
    },
    [rootDir]
  );
  // BaseReporter's public lifecycle permits an absent Test; CoverageReporter only consumes the result.
  const reporter: BaseReporter = new CoverageReporter(globalConfig, {
    firstRun: true,
    previousSuccess: true
  });
  const results: AggregatedResult = makeEmptyAggregatedTestResult();
  reporter.onTestResult(undefined, { ...createEmptyTestResult(), coverage: map.toJSON() });
  // No test contexts means no untested files can be recollected.
  await reporter.onRunComplete(new Set(), results);
  if (!results.coverageMap) {
    throw new Error('Jest coverage threshold evaluation did not complete.');
  }

  const normalizedRoot: string = rootDir.replaceAll('\\', '/');
  const rootPrefix: string = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
  return (
    reporter
      .getLastError()
      ?.message.split('\n')
      .map((message) => {
        let normalizedMessage: string = message.replaceAll('\\', '/');
        for (const rootScope of [normalizedRoot, rootPrefix]) {
          normalizedMessage = normalizedMessage
            .replaceAll(`"${rootScope}"`, '"."')
            .replaceAll(`exceeds ${rootScope} threshold`, 'exceeds . threshold')
            .replaceAll(`for ${rootScope} was not found.`, 'for . was not found.');
        }
        return normalizedMessage
          .replaceAll(`"${rootPrefix}`, '"')
          .replaceAll(`exceeds ${rootPrefix}`, 'exceeds ')
          .replaceAll(`for ${rootPrefix}`, 'for ');
      }) ?? []
  );
}
