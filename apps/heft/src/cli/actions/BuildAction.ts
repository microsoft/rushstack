// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  ICommandLineActionOptions
} from '@rushstack/ts-command-line';
import { SyncHook, AsyncParallelHook, AsyncSeriesHook } from 'tapable';
import { performance } from 'perf_hooks';

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionDataBase } from './HeftActionBase';
import { CleanAction } from './CleanAction';

export interface IBuildActionOptions extends IHeftActionBaseOptions {
  cleanAction: CleanAction;
}

/**
 * @public
 */
export class BuildPhaseHooksBase {
  public readonly run: AsyncParallelHook = new AsyncParallelHook();
}

/**
 * @public
 */
export interface IBuildPhase<TBuildPhaseHooks extends BuildPhaseHooksBase = BuildPhaseHooksBase> {
  hooks: TBuildPhaseHooks;
}

/**
 * @public
 */
export interface ISharedCopyStaticAssetsConfiguration {
  /**
   * File extensions that should be copied from the src folder to the destination folder(s)
   */
  fileExtensions?: string[];

  /**
   * Paths or globs that should be explicitly excluded. This takes precedence over paths listed in \"include\".
   */
  exclude?: string[];

  /**
   * Paths or globs that should be explicitly included.
   */
  include?: string[];
}

/**
 * @public
 */
export interface ICopyStaticAssetsConfiguration extends ISharedCopyStaticAssetsConfiguration {
  /**
   * The folder from which assets should be copied
   */
  sourceFolderName: string | undefined;

  /**
   * The folder(s) to which assets should be copied
   */
  destinationFolders: string[];
}

/**
 * @public
 */
export class CompilePhaseHooks extends BuildPhaseHooksBase {
  public readonly configureCopyStaticAssets: AsyncSeriesHook = new AsyncSeriesHook();
}

/**
 * @public
 */
export interface ICompilePhase extends IBuildPhase<CompilePhaseHooks> {
  copyStaticAssetsConfiguration: ICopyStaticAssetsConfiguration;
}

/**
 * @public
 */
export interface IBundlePhase extends IBuildPhase<BuildPhaseHooksBase> {}

/**
 * @public
 */
export class BuildHooks extends ActionHooksBase {
  public readonly preCompile: SyncHook<IBuildPhase> = new SyncHook<IBuildPhase>(['preCompile']);

  public readonly compile: SyncHook<ICompilePhase> = new SyncHook<ICompilePhase>(['compile']);

  public readonly bundle: SyncHook<IBundlePhase> = new SyncHook<IBundlePhase>(['bundle']);

  public readonly postBuild: SyncHook<IBuildPhase> = new SyncHook<IBuildPhase>(['postBuild']);
}

/**
 * @public
 */
export interface IBuildActionData extends IActionDataBase<BuildHooks> {
  productionFlag: boolean;
  liteFlag: boolean;
  locale?: string;
  cleanFlag: boolean;
  noTest: boolean;
  maxOldSpaceSize?: string;
  verboseFlag: boolean;
  watchMode: boolean;
}

export class BuildAction extends HeftActionBase<IBuildActionData, BuildHooks> {
  protected _noTestFlag: CommandLineFlagParameter;
  protected _watchFlag: CommandLineFlagParameter;
  private _productionFlag: CommandLineFlagParameter;
  private _localeParameter: CommandLineStringParameter;
  private _liteFlag: CommandLineFlagParameter;
  private _cleanFlag: CommandLineFlagParameter;
  private _maxOldSpaceSizeParameter: CommandLineStringParameter;

  private _cleanAction: CleanAction;

  public constructor(
    heftActionOptions: IBuildActionOptions,
    commandLineOptions: ICommandLineActionOptions = {
      actionName: 'build',
      summary: 'Build the project.',
      documentation: ''
    }
  ) {
    super(commandLineOptions, heftActionOptions, BuildHooks);

    this._cleanAction = heftActionOptions.cleanAction;
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._productionFlag = this.defineFlagParameter({
      parameterLongName: '--production',
      description: 'If specified, build ship/production output'
    });

    this._localeParameter = this.defineStringParameter({
      parameterLongName: '--locale',
      argumentName: 'LOCALE',
      description: 'Only build the specified locale, if applicable.'
    });

    this._liteFlag = this.defineFlagParameter({
      parameterLongName: '--lite',
      parameterShortName: '-l',
      description: 'Perform a minimal build, skipping optional steps like linting.'
    });

    this._cleanFlag = this.defineFlagParameter({
      parameterLongName: '--clean',
      description: 'If specified, clean the package before rebuilding.'
    });

    this._noTestFlag = this.defineFlagParameter({
      parameterLongName: '--notest',
      description: 'If specified, run the build without testing.'
    });

    this._maxOldSpaceSizeParameter = this.defineStringParameter({
      parameterLongName: '--max-old-space-size',
      argumentName: 'SIZE',
      description: 'Used to specify the max old space size.'
    });

    this._watchFlag = this.defineFlagParameter({
      parameterLongName: '--watch',
      description: 'If provided, run tests in watch mode.'
    });
  }

  protected async actionExecute(actionData: IBuildActionData): Promise<void> {
    if (this._cleanFlag.value) {
      await this._runWithLogging('Clean', async () => await this._cleanAction.executeInner());
    }

    const preCompilePhase: IBuildPhase = { hooks: new BuildPhaseHooksBase() };
    actionData.hooks.preCompile.call(preCompilePhase);

    const compilePhase: ICompilePhase = {
      hooks: new CompilePhaseHooks(),
      copyStaticAssetsConfiguration: {
        fileExtensions: [],
        exclude: [],
        include: [],
        sourceFolderName: undefined,
        destinationFolders: []
      }
    };
    actionData.hooks.compile.call(compilePhase);

    const bundlePhase: IBundlePhase = { hooks: new BuildPhaseHooksBase() };
    actionData.hooks.bundle.call(bundlePhase);

    const postBuildPhase: IBuildPhase = { hooks: new BuildPhaseHooksBase() };
    actionData.hooks.postBuild.call(postBuildPhase);

    if (actionData.watchMode) {
      // In --watch mode, run all configuration upfront and then kick off all phases
      // concurrently with the expectation that the their promises will never resolve
      // and that they will handle watching filesystem changes

      await compilePhase.hooks.configureCopyStaticAssets.promise();

      await Promise.all([
        this._runPhaseWithLogging('Pre-compile', preCompilePhase),
        this._runPhaseWithLogging('Compile', compilePhase),
        this._runPhaseWithLogging('Bundle', bundlePhase),
        this._runPhaseWithLogging('Post-build', postBuildPhase)
      ]);
    } else {
      await this._runPhaseWithLogging('Pre-compile', preCompilePhase);

      await compilePhase.hooks.configureCopyStaticAssets.promise();
      await this._runPhaseWithLogging('Compile', compilePhase);

      await this._runPhaseWithLogging('Bundle', bundlePhase);

      await this._runPhaseWithLogging('Post-build', postBuildPhase);
    }
  }

  protected getDefaultActionData(): Omit<IBuildActionData, 'hooks'> {
    return {
      productionFlag: this._productionFlag.value,
      liteFlag: this._liteFlag.value,
      locale: this._localeParameter.value,
      cleanFlag: this._cleanFlag.value,
      noTest: this._noTestFlag.value,
      maxOldSpaceSize: this._maxOldSpaceSizeParameter.value,
      verboseFlag: this.verboseFlag.value,
      watchMode: this._watchFlag.value
    };
  }

  protected async _runPhaseWithLogging(buildPhaseName: string, buildPhase: IBuildPhase): Promise<void> {
    if (buildPhase.hooks.run.isUsed()) {
      await this._runWithLogging(buildPhaseName, async () => await buildPhase.hooks.run.promise());
    }
  }

  private async _runWithLogging(buildPhaseName: string, fn: () => Promise<void>): Promise<void> {
    this.terminal.writeLine(` ---- ${buildPhaseName} started ---- `);
    const startTime: number = performance.now();
    let finishedLoggingWord: string = 'finished';
    try {
      await fn();
    } catch (e) {
      finishedLoggingWord = 'encountered an error';
      throw e;
    } finally {
      const executionTime: number = Math.round(performance.now() - startTime);
      this.terminal.writeLine(` ---- ${buildPhaseName} ${finishedLoggingWord} (${executionTime}ms) ---- `);
    }
  }
}
