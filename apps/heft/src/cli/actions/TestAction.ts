// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineStringListParameter,
  CommandLineStringParameter,
  CommandLineIntegerParameter
} from '@rushstack/ts-command-line';

import { BuildAction } from './BuildAction';
import { IHeftActionBaseOptions } from './HeftActionBase';
import { TestStage, ITestStageOptions } from '../../stages/TestStage';
import { Logging } from '../../utilities/Logging';
import { IBuildStageContext, ICompileSubstage } from '../../stages/BuildStage';

export class TestAction extends BuildAction {
  private _noTestFlag: CommandLineFlagParameter;
  private _noBuildFlag: CommandLineFlagParameter;
  private _updateSnapshotsFlag: CommandLineFlagParameter;
  private _findRelatedTests: CommandLineStringListParameter;
  private _silent: CommandLineFlagParameter;
  private _testNamePattern: CommandLineStringParameter;
  private _testPathPattern: CommandLineStringListParameter;
  private _testTimeout: CommandLineIntegerParameter;
  private _debugHeftReporter: CommandLineFlagParameter;
  private _maxWorkers: CommandLineStringParameter;

  public constructor(heftActionOptions: IHeftActionBaseOptions) {
    super(heftActionOptions, {
      actionName: 'test',
      summary: 'Build the project and run tests.',
      documentation: ''
    });
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._noTestFlag = this.defineFlagParameter({
      parameterLongName: '--no-test',
      description: 'If specified, run the build without testing.',
      undocumentedSynonyms: ['--notest'] // To be removed
    });

    this._noBuildFlag = this.defineFlagParameter({
      parameterLongName: '--no-build',
      description: 'If provided, only run tests. Do not build first.'
    });

    this._updateSnapshotsFlag = this.defineFlagParameter({
      parameterLongName: '--update-snapshots',
      parameterShortName: '-u',
      description:
        'Update Jest snapshots while running the tests.' +
        ' This corresponds to the "--updateSnapshots" parameter in Jest'
    });

    this._findRelatedTests = this.defineStringListParameter({
      parameterLongName: '--find-related-tests',
      argumentName: 'SOURCE_FILE',
      description:
        'Find and run the tests that cover a space separated list of source files that' +
        ' were passed in as arguments.' +
        ' This corresponds to the "--findRelatedTests" parameter in Jest\'s documentation.'
    });

    this._silent = this.defineFlagParameter({
      parameterLongName: '--silent',
      description:
        'Prevent tests from printing messages through the console.' +
        ' This corresponds to the "--silent" parameter in Jest\'s documentation.'
    });

    this._testNamePattern = this.defineStringParameter({
      parameterLongName: '--test-name-pattern',
      parameterShortName: '-t',
      argumentName: 'REGEXP',
      description:
        'Run only tests with a name that matches a regular expression.' +
        ' The REGEXP is matched against the full name, which is a combination of the test name' +
        ' and all its surrounding describe blocks.' +
        ' This corresponds to the "--testNamePattern" parameter in Jest\'s documentation.'
    });

    this._testPathPattern = this.defineStringListParameter({
      parameterLongName: '--test-path-pattern',
      argumentName: 'REGEXP',
      description:
        'Run only tests with a source file path that matches a regular expression.' +
        ' On Windows you will need to use "/" instead of ""' +
        ' This corresponds to the "--testPathPattern" parameter in Jest\'s documentation.'
    });

    this._testTimeout = this.defineIntegerParameter({
      parameterLongName: '--test-timeout-ms',
      argumentName: 'INTEGER',
      description:
        "Change the default timeout for tests; if a test doesn't complete within this many" +
        ' milliseconds, it will fail. Individual tests can override the default. If unspecified, ' +
        ' the default is normally 5000 ms.' +
        ' This corresponds to the "--testTimeout" parameter in Jest\'s documentation.'
    });

    this._debugHeftReporter = this.defineFlagParameter({
      parameterLongName: '--debug-heft-reporter',
      description:
        'Normally Heft installs a custom Jest reporter so that test results are presented consistently' +
        ' with other task logging. If you suspect a problem with the HeftJestReporter, specify' +
        ' "--debug-heft-reporter" to temporarily disable it so that you can compare with how Jest\'s' +
        ' default reporter would have presented it. Include this output in your bug report.' +
        ' Do not use "--debug-heft-reporter" in production.'
    });

    this._maxWorkers = this.defineStringParameter({
      parameterLongName: '--max-workers',
      argumentName: 'COUNT_OR_PERCENTAGE',
      description:
        'Use this parameter to control maximum number of worker processes tests are allowed to use.' +
        ' This parameter is similar to the parameter noted in the Jest documentation, and can either be' +
        ' an integer representing the number of workers to spawn when running tests, or can be a string' +
        ' representing a percentage of the available CPUs on the machine to utilize. Example values: "3",' +
        ' "25%%"' // The "%%" is required because argparse (used by ts-command-line) treats % as an escape character
    });
  }

  protected async actionExecuteAsync(): Promise<void> {
    const shouldBuild: boolean = !this._noBuildFlag.value;
    const watchMode: boolean = this._watchFlag.value;
    const noTest: boolean = this._noTestFlag.value;
    const lite: boolean = this._liteFlag.value;

    if (watchMode) {
      if (!shouldBuild) {
        throw new Error(`${this._watchFlag.longName} is not compatible with ${this._noBuildFlag.longName}`);
      } else if (noTest) {
        throw new Error(`${this._watchFlag.longName} is not compatible with ${this._noTestFlag.longName}`);
      } else if (lite) {
        throw new Error(`${this._watchFlag.longName} is not compatible with ${this._liteFlag.longName}`);
      }
    }

    if (!shouldBuild) {
      if (noTest) {
        throw new Error(`${this._noTestFlag.longName} is not compatible with ${this._noBuildFlag.longName}`);
      }
    }

    if (noTest || lite /* "&& shouldBuild" is implied */) {
      await super.actionExecuteAsync();
    } else {
      const testStage: TestStage = this.stages.testStage;
      const testStageOptions: ITestStageOptions = {
        watchMode: this._watchFlag.value,
        updateSnapshots: this._updateSnapshotsFlag.value,

        findRelatedTests: this._findRelatedTests.values,
        silent: this._silent.value,
        testNamePattern: this._testNamePattern.value,
        testPathPattern: this._testPathPattern.values,
        testTimeout: this._testTimeout.value,
        debugHeftReporter: this._debugHeftReporter.value,
        maxWorkers: this._maxWorkers.value
      };
      await testStage.initializeAsync(testStageOptions);

      if (watchMode) {
        await this.runCleanIfRequestedAsync();

        const TAP_NAME: string = 'test-action';
        this.stages.buildStage.stageInitializationHook.tap(TAP_NAME, (build: IBuildStageContext) => {
          build.hooks.compile.tap(TAP_NAME, (compile: ICompileSubstage) => {
            compile.hooks.afterTypescriptFirstEmit.tapPromise(
              TAP_NAME,
              async () => await testStage.executeAsync()
            );
          });
        });

        // In --watch mode, kick off all stages concurrently with the expectation that the their
        // promises will never resolve and that they will handle watching filesystem changes
        await this.runBuildAsync();
      } else {
        if (shouldBuild) {
          await super.actionExecuteAsync();

          if (this.loggingManager.errorsHaveBeenEmitted) {
            return;
          }

          await Logging.runFunctionWithLoggingBoundsAsync(
            this.terminal,
            'Test',
            async () => await testStage.executeAsync()
          );
        } else {
          await testStage.executeAsync();
        }
      }
    }
  }
}
