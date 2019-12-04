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
  private _options: IReporterOptions | undefined;

  public constructor(globalConfig: Jest.GlobalConfig, options?: IReporterOptions) {
    super(globalConfig);
    this._options = options;
  }

  public log(message: string): void {
    process.stdout.write(message + '\n');
  }

  public onRunComplete(contexts: Set<Jest.Context>, results: Jest.AggregatedResult): void {
    super.onRunComplete(contexts, results);
    if (!this._options || !this._options.writeNUnitResults) {
      return;
    }

    const outputFilePath: string = this._options.outputFilePath;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testResults: TestResults = new TestResults(results);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: string = xml(testResults, { declaration: true, indent: '  ' });
    FileSystem.writeFile(outputFilePath, data, { ensureFolderExists: true });
  }
}

interface IReporterOptions {
  outputFilePath: string,
  writeNUnitResults?: boolean
}

module.exports = JestReporter;