// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Terminal, Colors } from '@rushstack/node-core-library';
import {
  Reporter,
  Test,
  TestResult,
  AggregatedResult,
  Context,
  ReporterOnStartOptions,
  Config
} from '@jest/reporters';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';

export interface IHeftJestReporterOptions {
  heftConfiguration: HeftConfiguration;
}

export default class HeftJestReporter implements Reporter {
  private _terminal: Terminal;
  private _buildFolder: string;

  public constructor(jestConfig: Config.GlobalConfig, options: IHeftJestReporterOptions) {
    this._terminal = options.heftConfiguration.terminal;
    this._buildFolder = options.heftConfiguration.buildFolder;
  }

  public async onTestStart(test: Test): Promise<void> {
    this._terminal.writeLine(
      Colors.whiteBackground(Colors.black('START')),
      ` ${this._getTestPath(test.path)}`
    );
  }

  public async onTestResult(
    test: Test,
    testResult: TestResult,
    aggregatedResult: AggregatedResult
  ): Promise<void> {
    const { numPassingTests, numFailingTests, failureMessage } = testResult;

    if (numFailingTests > 0) {
      this._terminal.write(Colors.redBackground(Colors.black('FAIL')));
    } else {
      this._terminal.write(Colors.greenBackground(Colors.black('PASS')));
    }

    const duration: string = test.duration ? `${test.duration / 1000}s` : '?';
    this._terminal.writeLine(
      ` ${this._getTestPath(
        test.path
      )} (duration: ${duration}, ${numPassingTests} passed, ${numFailingTests} failed)`
    );

    if (failureMessage) {
      this._terminal.writeErrorLine(failureMessage);
    }

    if (testResult.snapshot.updated) {
      this._terminal.writeErrorLine(
        `Updated ${this._formatWithPlural(testResult.snapshot.updated, 'snapshot', 'snapshots')}`
      );
    }

    if (testResult.snapshot.added) {
      this._terminal.writeErrorLine(
        `Added ${this._formatWithPlural(testResult.snapshot.added, 'snapshot', 'snapshots')}`
      );
    }
  }

  public async onRunStart(
    { numTotalTestSuites }: AggregatedResult,
    options: ReporterOnStartOptions
  ): Promise<void> {
    // Jest prints some text that changes the console's color without a newline, so we reset the console's color here
    // and print a newline.
    this._terminal.writeLine('\u001b[0m');
    this._terminal.writeLine(
      `Run start. ${this._formatWithPlural(numTotalTestSuites, 'test suite', 'test suites')}`
    );
  }

  public async onRunComplete(contexts: Set<Context>, results: AggregatedResult): Promise<void> {
    const { numPassedTests, numFailedTests, numTotalTests } = results;

    this._terminal.writeLine();
    this._terminal.writeLine('Tests finished:');

    const successesText: string = `  Successes: ${numPassedTests}`;
    this._terminal.writeLine(numPassedTests > 0 ? Colors.green(successesText) : successesText);

    const failText: string = `  Failures: ${numFailedTests}`;
    this._terminal.writeLine(numFailedTests > 0 ? Colors.red(failText) : failText);

    this._terminal.writeLine(`  Total: ${numTotalTests}`);
  }

  public getLastError(): void {
    // This reporter doesn't have any errors to throw
  }

  private _getTestPath(fullTestPath: string): string {
    return path.relative(this._buildFolder, fullTestPath);
  }

  private _formatWithPlural(num: number, singular: string, plural: string): string {
    return `${num} ${num === 1 ? singular : plural}`;
  }
}
