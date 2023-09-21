// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Config } from '@jest/types';
import type {
  Reporter,
  Test,
  TestResult,
  AggregatedResult,
  TestContext,
  ReporterOnStartOptions
} from '@jest/reporters';

module.exports = class CustomJestReporter implements Reporter {
  public constructor(globalConfig: Config.GlobalConfig, options: unknown) {}

  public onRunStart(results: AggregatedResult, options: ReporterOnStartOptions): void | Promise<void> {
    // eslint-disable-next-line no-console
    console.log();
    // eslint-disable-next-line no-console
    console.log(`################# Custom Jest reporter: Starting test run #################`);
  }

  public onTestStart(test: Test): void | Promise<void> {}

  public onTestResult(test: Test, testResult: TestResult, results: AggregatedResult): void | Promise<void> {
    // eslint-disable-next-line no-console
    console.log('Custom Jest reporter: Reporting test result');

    for (const result of testResult.testResults) {
      // eslint-disable-next-line no-console
      console.log(`${result.title}: ${result.status}`);
    }
  }

  public onRunComplete(contexts: Set<TestContext>, results: AggregatedResult): void | Promise<void> {
    // eslint-disable-next-line no-console
    console.log('################# Completing test run #################');
    // eslint-disable-next-line no-console
    console.log();
  }

  public getLastError(): void | Error {}
};
