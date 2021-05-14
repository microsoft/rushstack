// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';
import * as xml from 'xml';
import * as TestResults from 'jest-nunit-reporter/src/Testresults';
import { Config, Context, AggregatedResult, DefaultReporter } from '@jest/reporters';

/**
 * Jest logs message to stderr. This class is to override that behavior so that
 * rush does not get confused.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class JestReporter extends (DefaultReporter as { new (globalConfig: Config.GlobalConfig): any }) {
  private _options: IReporterOptions | undefined;

  public constructor(globalConfig: Config.GlobalConfig, options?: IReporterOptions) {
    super(globalConfig);
    this._options = options;
  }

  public log(message: string): void {
    process.stdout.write(message + '\n');
  }

  public onRunComplete(contexts: Set<Context>, results: AggregatedResult): void {
    super.onRunComplete(contexts, results);
    if (!this._options || !this._options.writeNUnitResults) {
      return;
    }

    const outputFilePath: string | undefined = this._options.outputFilePath;
    if (!outputFilePath) {
      throw new Error('Jest NUnit output was enabled but no outputFilePath was provided');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testResults: TestResults = new TestResults(results);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: string = xml(testResults, { declaration: true, indent: '  ' });
    FileSystem.writeFile(outputFilePath, data, { ensureFolderExists: true });
  }
}

interface IReporterOptions {
  outputFilePath?: string;
  writeNUnitResults?: boolean;
}

module.exports = JestReporter;
