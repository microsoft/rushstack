// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  CommandLineStringListParameter,
  CommandLineStringParameter,
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IHeftTaskSession
} from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

import {
  DEFAULT_COVERAGE_THRESHOLDS_ARTIFACT_RELATIVE_PATH,
  DEFAULT_JUNIT_ARTIFACT_RELATIVE_PATH,
  type ICoverageThresholds
} from './TestResultArtifacts';
import {
  DEFAULT_SYNTHETIC_COVERAGE_TEST_NAME,
  DEFAULT_SYNTHETIC_JUNIT_RELATIVE_PATH,
  type ICoverageMetric,
  type ICoverageViolation,
  evaluateCoverageThresholds,
  loadCoverageThresholdsAsync,
  readCoberturaMetricsAsync,
  readJunitFailuresAsync,
  writeSyntheticCoverageFailureJunitAsync
} from './TestResultEvaluator';

const PLUGIN_NAME: 'test-evaluator-plugin' = 'test-evaluator-plugin';

interface ITestEvaluatorPluginOptions {
  junitReportPaths?: string[];
  coberturaReportPaths?: string[];
  coverageThresholdsPath?: string;
  coverageThresholds?: ICoverageThresholds;
  syntheticCoverageTestName?: string;
  syntheticCoverageJUnitPath?: string;
}

export default class TestEvaluatorPlugin implements IHeftTaskPlugin<ITestEvaluatorPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    pluginOptions?: ITestEvaluatorPluginOptions
  ): void {
    const junitReportPathParameter: CommandLineStringListParameter =
      taskSession.parameters.getStringListParameter('--junit-report-path');
    const coberturaReportPathParameter: CommandLineStringListParameter =
      taskSession.parameters.getStringListParameter('--cobertura-report-path');
    const coverageThresholdsPathParameter: CommandLineStringParameter =
      taskSession.parameters.getStringParameter('--coverage-thresholds-path');

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const junitReportPaths: string[] =
        junitReportPathParameter.values.length > 0
          ? Array.from(junitReportPathParameter.values)
          : pluginOptions?.junitReportPaths || [DEFAULT_JUNIT_ARTIFACT_RELATIVE_PATH];

      const coberturaReportPaths: string[] =
        coberturaReportPathParameter.values.length > 0
          ? Array.from(coberturaReportPathParameter.values)
          : pluginOptions?.coberturaReportPaths || ['coverage/cobertura-coverage.xml'];

      const coverageThresholdsPath: string =
        coverageThresholdsPathParameter.value ||
        pluginOptions?.coverageThresholdsPath ||
        DEFAULT_COVERAGE_THRESHOLDS_ARTIFACT_RELATIVE_PATH;

      const syntheticCoverageTestName: string =
        pluginOptions?.syntheticCoverageTestName || DEFAULT_SYNTHETIC_COVERAGE_TEST_NAME;
      const syntheticCoverageJUnitPath: string =
        pluginOptions?.syntheticCoverageJUnitPath || DEFAULT_SYNTHETIC_JUNIT_RELATIVE_PATH;

      let junitReportWasFound: boolean = false;
      for (const relativeJunitPath of junitReportPaths) {
        const absoluteJunitPath: string = path.resolve(heftConfiguration.buildFolderPath, relativeJunitPath);
        if (!(await FileSystem.existsAsync(absoluteJunitPath))) {
          continue;
        }

        junitReportWasFound = true;
        const failures: {
          suiteName: string;
          testName: string;
          message: string;
        }[] = await readJunitFailuresAsync(absoluteJunitPath);
        for (const failure of failures) {
          taskSession.logger.emitError(
            new Error(`${failure.suiteName} > ${failure.testName}: ${failure.message}`)
          );
        }
      }

      if (!junitReportWasFound) {
        taskSession.logger.emitWarning(
          new Error(`No JUnit report was found for evaluation (looked in: ${junitReportPaths.join(', ')})`)
        );
      }

      const explicitThresholds: ICoverageThresholds | undefined = pluginOptions?.coverageThresholds;
      const configuredThresholds: ICoverageThresholds | undefined =
        explicitThresholds ||
        (await loadCoverageThresholdsAsync(heftConfiguration.buildFolderPath, coverageThresholdsPath));

      if (configuredThresholds) {
        let coberturaReportWasFound: boolean = false;
        for (const relativeCoberturaPath of coberturaReportPaths) {
          const absoluteCoberturaPath: string = path.resolve(
            heftConfiguration.buildFolderPath,
            relativeCoberturaPath
          );
          if (!(await FileSystem.existsAsync(absoluteCoberturaPath))) {
            continue;
          }

          coberturaReportWasFound = true;
          const coverageMetrics: ICoverageMetric | undefined =
            await readCoberturaMetricsAsync(absoluteCoberturaPath);
          const violations: ICoverageViolation[] = evaluateCoverageThresholds(
            coverageMetrics,
            configuredThresholds
          );
          if (violations.length > 0) {
            const syntheticJunitAbsolutePath: string = path.resolve(
              heftConfiguration.buildFolderPath,
              syntheticCoverageJUnitPath
            );
            await writeSyntheticCoverageFailureJunitAsync(
              syntheticJunitAbsolutePath,
              syntheticCoverageTestName,
              violations
            );

            taskSession.logger.emitError(
              new Error(
                `${syntheticCoverageTestName}: ` +
                  violations
                    .map(
                      (violation) =>
                        `${violation.metric}=${violation.actual.toFixed(2)} < ${violation.required.toFixed(2)}`
                    )
                    .join(', ')
              )
            );
          }
        }

        if (!coberturaReportWasFound) {
          taskSession.logger.emitError(
            new Error(
              `Coverage thresholds were configured, but no Cobertura report was found (looked in: ${coberturaReportPaths.join(
                ', '
              )})`
            )
          );
        }
      }
    });
  }
}
