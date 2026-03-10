// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { AsyncSeriesHook } from 'tapable';

import {
  FileSystem,
  type IPackageJson,
  JsonFile,
  AlreadyReportedError,
  Text
} from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import type { IGlobalCommand } from '../../pluginFramework/RushLifeCycle.ts';
import { BaseScriptAction, type IBaseScriptActionOptions } from './BaseScriptAction.ts';
import { Utilities } from '../../utilities/Utilities.ts';
import { Stopwatch } from '../../utilities/Stopwatch.ts';
import { Autoinstaller } from '../../logic/Autoinstaller.ts';
import type { IGlobalCommandConfig, IShellCommandTokenContext } from '../../api/CommandLineConfiguration.ts';
import { measureAsyncFn } from '../../utilities/performance.ts';

/**
 * Constructor parameters for GlobalScriptAction.
 */
export interface IGlobalScriptActionOptions extends IBaseScriptActionOptions<IGlobalCommandConfig> {
  shellCommand: string;
  autoinstallerName: string | undefined;
}

/**
 * This class implements custom commands that are run once globally for the entire repo
 * (versus bulk commands, which run separately for each project).  The action executes
 * a user-defined script file.
 *
 * @remarks
 * Bulk commands can be defined via common/config/command-line.json.  Rush's predefined "build"
 * and "rebuild" commands are also modeled as bulk commands, because they essentially just
 * invoke scripts from package.json in the same way as a custom command.
 */
export class GlobalScriptAction extends BaseScriptAction<IGlobalCommandConfig> {
  private readonly _shellCommand: string;
  private readonly _autoinstallerName: string;
  private readonly _autoinstallerFullPath: string;

  public constructor(options: IGlobalScriptActionOptions) {
    super(options);
    this._shellCommand = options.shellCommand;
    this._autoinstallerName = options.autoinstallerName || '';

    if (this._autoinstallerName) {
      Autoinstaller.validateName(this._autoinstallerName);

      // Example: .../common/autoinstallers/my-task
      this._autoinstallerFullPath = path.join(
        this.rushConfiguration.commonAutoinstallersFolder,
        this._autoinstallerName
      );

      if (!FileSystem.exists(this._autoinstallerFullPath)) {
        throw new Error(
          `The custom command "${this.actionName}" specifies an "autoinstallerName" setting` +
            ' but the path does not exist: ' +
            this._autoinstallerFullPath
        );
      }

      // Example: .../common/autoinstallers/my-task/package.json
      const packageJsonPath: string = path.join(this._autoinstallerFullPath, 'package.json');
      if (!FileSystem.exists(packageJsonPath)) {
        throw new Error(
          `The custom command "${this.actionName}" specifies an "autoinstallerName" setting` +
            ` whose package.json file was not found: ` +
            packageJsonPath
        );
      }

      const packageJson: IPackageJson = JsonFile.load(packageJsonPath);

      if (packageJson.name !== this._autoinstallerName) {
        throw new Error(
          `The custom command "${this.actionName}" specifies an "autoinstallerName" setting,` +
            ` but the package.json file's "name" field is not "${this._autoinstallerName}": ` +
            packageJsonPath
        );
      }
    } else {
      this._autoinstallerFullPath = '';
    }

    this.defineScriptParameters();
  }

  private async _prepareAutoinstallerNameAsync(): Promise<void> {
    const autoInstaller: Autoinstaller = new Autoinstaller({
      autoinstallerName: this._autoinstallerName,
      rushConfiguration: this.rushConfiguration,
      rushGlobalFolder: this.rushGlobalFolder
    });

    await autoInstaller.prepareAsync();
  }

  public async runAsync(): Promise<void> {
    const { hooks: sessionHooks } = this.rushSession;
    if (sessionHooks.runAnyGlobalCustomCommand.isUsed()) {
      // Avoid the cost of compiling the hook if it wasn't tapped.
      await sessionHooks.runAnyGlobalCustomCommand.promise(this);
    }

    const hookForAction: AsyncSeriesHook<IGlobalCommand> | undefined =
      sessionHooks.runGlobalCustomCommand.get(this.actionName);
    if (hookForAction) {
      // Run the more specific hook for a command with this name after the general hook
      await hookForAction.promise(this);
    }

    const additionalPathFolders: string[] =
      this.commandLineConfiguration?.additionalPathFolders.slice() || [];

    if (this._autoinstallerName) {
      await measureAsyncFn('rush:globalScriptAction:prepareAutoinstaller', () =>
        this._prepareAutoinstallerNameAsync()
      );

      const autoinstallerNameBinPath: string = path.join(this._autoinstallerFullPath, 'node_modules', '.bin');
      additionalPathFolders.push(autoinstallerNameBinPath);
    }

    // Collect all custom parameter values
    const customParameterValues: string[] = [];
    for (const tsCommandLineParameter of this.customParameters.values()) {
      tsCommandLineParameter.appendToArgList(customParameterValues);
    }

    for (let i: number = 0; i < customParameterValues.length; i++) {
      let customParameterValue: string = customParameterValues[i];
      customParameterValue = customParameterValue.replace(/"/g, '\\"');

      if (customParameterValue.indexOf(' ') >= 0) {
        customParameterValue = `"${customParameterValue}"`;
      }

      customParameterValues[i] = customParameterValue;
    }

    let shellCommand: string = this._shellCommand;
    if (customParameterValues.length > 0) {
      shellCommand += ' ' + customParameterValues.join(' ');
    }

    const shellCommandTokenContext: IShellCommandTokenContext | undefined =
      this.commandLineConfiguration?.shellCommandTokenContext;
    if (shellCommandTokenContext) {
      shellCommand = this._expandShellCommandWithTokens(shellCommand, shellCommandTokenContext);
    }
    this._rejectAnyTokensInShellCommand(shellCommand, shellCommandTokenContext);

    const stopwatch: Stopwatch = Stopwatch.start();

    const exitCode: number = Utilities.executeLifecycleCommand(shellCommand, {
      rushConfiguration: this.rushConfiguration,
      workingDirectory: this.rushConfiguration.rushJsonFolder,
      initCwd: this.rushConfiguration.commonTempFolder,
      handleOutput: false,
      environmentPathOptions: {
        includeRepoBin: true,
        additionalPathFolders: additionalPathFolders
      }
    });

    process.exitCode = exitCode;

    stopwatch.stop();

    if (this.parser.telemetry) {
      this.parser.telemetry.log({
        name: this.actionName,
        durationInSeconds: stopwatch.duration,
        result: exitCode > 0 ? 'Failed' : 'Succeeded',
        extraData: {
          customParameterValue: customParameterValues.join(' ')
        }
      });

      this.parser.flushTelemetry();
    }

    if (exitCode > 0) {
      // eslint-disable-next-line no-console
      console.log('\n' + Colorize.red(`The script failed with exit code ${exitCode}`));
      throw new AlreadyReportedError();
    }
  }

  private _expandShellCommandWithTokens(
    shellCommand: string,
    tokenContext: IShellCommandTokenContext
  ): string {
    let expandedShellCommand: string = shellCommand;
    for (const [token, tokenReplacement] of Object.entries(tokenContext)) {
      expandedShellCommand = Text.replaceAll(expandedShellCommand, `<${token}>`, tokenReplacement);
    }
    return expandedShellCommand;
  }

  private _rejectAnyTokensInShellCommand(
    shellCommand: string,
    tokenContext?: IShellCommandTokenContext
  ): void {
    if (shellCommand.indexOf('<') < 0 && shellCommand.indexOf('>') < 0) {
      return;
    }
    const tokenRegExp: RegExp = /(\<[^<]*?\>)/;
    const match: RegExpExecArray | null = tokenRegExp.exec(shellCommand);
    if (match) {
      throw new Error(
        `The "shellCommand" value contains an unrecognized token "${match[1]}".${
          tokenContext ? ` Available tokens are ${Object.keys(tokenContext).join(', ')}.` : ''
        }`
      );
    }
    throw new Error(`The "shellCommand" value contains extra token characters ("<" or ">"): ${shellCommand}`);
  }
}
