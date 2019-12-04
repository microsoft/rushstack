import { FileSystem } from '@microsoft/node-core-library';
import * as path from 'path';
import * as xml from 'xml';
import * as Jest from 'jest-cli';
import TestResults = require('jest-nunit-reporter/src/Testresults');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEFAULT_REPORTER: any = require('jest-cli/build/reporters/default_reporter').default;

/**
 * Jest logs message to stderr. This class is to override that behavior so that
 * rush does not get confused.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class JestReporter extends (DEFAULT_REPORTER as { new (globalConfig: Jest.GlobalConfig): any }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _globalConfig: Jest.GlobalConfig;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(globalConfig: Jest.GlobalConfig) {
    super(globalConfig);
    this._globalConfig = globalConfig;

    this._err = this._out;
  }

  public log(message: string): void {
    process.stdout.write(message + '\n');
  }

  public onRunComplete(contexts: Set<Jest.Context>, results: Jest.AggregatedResult): void {
    super.onRunComplete(contexts, results);

    let outputPath: string | undefined = undefined;
    let filename: string | undefined = undefined;

    for (const reporter of (this._globalConfig.reporters as (string | ReporterConfig)[])) {
      const reporterConfig: ReporterConfig | undefined = reporter as ReporterConfig;
      if (reporterConfig && reporterConfig[0].lastIndexOf('JestReporter') >= 0) {
        if (!reporterConfig[1].writeNUnitResults) {
          return;
        }

        outputPath = reporterConfig[1].outputPath;
        filename = reporterConfig[1].outputFilename;
      }
    }

    if (!!outputPath && !!filename) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const testResults: any = new TestResults(results);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = xml(testResults, { declaration: true, indent: '  ' });
      FileSystem.writeFile(path.join(outputPath, filename), data, { ensureFolderExists: true });
    }
  }
}

type ReporterConfig = [string, { outputPath: string, outputFilename: string, writeNUnitResults?: boolean }]

module.exports = JestReporter;