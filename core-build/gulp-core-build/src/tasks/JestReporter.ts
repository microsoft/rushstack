import { FileSystem } from '@microsoft/node-core-library';
import * as xml from 'xml';
import * as Jest from 'jest-cli';
import * as TestResults from 'jest-nunit-reporter/src/Testresults';
import { default as DEFAULT_REPORTER } from 'jest-cli/build/reporters/default_reporter';

/**
 * Jest logs message to stderr. This class is to override that behavior so that
 * rush does not get confused.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class JestReporter extends (DEFAULT_REPORTER as { new (globalConfig: Jest.GlobalConfig): any }) {

  public constructor(globalConfig: Jest.GlobalConfig) {
    super(globalConfig);
  }

  public log(message: string): void {
    process.stdout.write(message + '\n');
  }

  public onRunComplete(contexts: Set<Jest.Context>, results: Jest.AggregatedResult): void {
    super.onRunComplete(contexts, results);

    // Since multiple reporters can be used, we need to look through the reporters list to
    // find this one. We also want to check if writing the output file was enabled on the
    // configuration and that we have an output file path
    for (const reporter of (this._globalConfig.reporters as (string | ReporterConfig)[])) {
      const reporterConfig: ReporterConfig | undefined = reporter as ReporterConfig;
      if (
        reporterConfig &&
        reporterConfig[0].lastIndexOf('JestReporter') >= 0 &&
        reporterConfig[1].writeNUnitResults &&
        reporterConfig[1].outputFile
      ) {
        const outputFile: string = reporterConfig[1].outputFile;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const testResults: TestResults = new TestResults(results);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: string = xml(testResults, { declaration: true, indent: '  ' });
        FileSystem.writeFile(outputFile, data, { ensureFolderExists: true });
        break;
      }
    }
  }
}

type ReporterConfig = [string, { outputFile: string, writeNUnitResults?: boolean }]

module.exports = JestReporter;