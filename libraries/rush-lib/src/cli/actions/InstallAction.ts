// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/node-core-library';

import { BaseInstallAction } from './BaseInstallAction';
import { IInstallManagerOptions } from '../../logic/base/BaseInstallManager';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { SelectionParameterSet } from '../parsing/SelectionParameterSet';

export class InstallAction extends BaseInstallAction {
  private readonly _checkOnlyParameter!: CommandLineFlagParameter;
  private _ignoreScriptsParameter!: CommandLineFlagParameter;
  /**
   * Whether split workspace projects are included in install
   *
   * This parameter only supported when there is split workspace project
   */
  private _includeSplitWorkspaceParameter?: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'install',
      summary: 'Install package dependencies for all projects in the repo according to the shrinkwrap file',
      documentation:
        'The "rush install" command installs package dependencies for all your projects,' +
        ' based on the shrinkwrap file that is created/updated using "rush update".' +
        ' (This "shrinkwrap" file stores a central inventory of all dependencies and versions' +
        ' for projects in your repo. It is found in the "common/config/rush" folder.)' +
        ' If the shrinkwrap file is missing or outdated (e.g. because project package.json files have' +
        ' changed), "rush install" will fail and tell you to run "rush update" instead.' +
        ' This read-only nature is the main feature:  Continuous integration builds should use' +
        ' "rush install" instead of "rush update" to catch developers who forgot to commit their' +
        ' shrinkwrap changes.  Cautious people can also use "rush install" if they want to avoid' +
        ' accidentally updating their shrinkwrap file.',
      parser
    });

    this._selectionParameters = new SelectionParameterSet(this.rushConfiguration, this, {
      // Include lockfile processing since this expands the selection, and we need to select
      // at least the same projects selected with the same query to "rush build"
      includeExternalDependencies: true,
      // Disable filtering because rush-project.json is riggable and therefore may not be available
      enableFiltering: false
    });

    if (this.rushConfiguration?.hasSplitWorkspaceProject) {
      this._includeSplitWorkspaceParameter = this.defineFlagParameter({
        parameterLongName: '--include-split-workspace',
        description:
          'Normally "rush install" only install projects in normal rush workspace.' +
          ' When you want to install for split workspace projects, you can run' +
          ' "rush install --include-split-workspace", which installs entire split workspace projects.' +
          ' Or, you can specify selection parameters to do partial install for split workspace projects, ' +
          ' such as "rush install --to <split_workspace_package_name>".'
      });
    }

    this._checkOnlyParameter = this.defineFlagParameter({
      parameterLongName: '--check-only',
      description: `Only check the validity of the shrinkwrap file without performing an install.`
    });

    this._ignoreScriptsParameter = this.defineFlagParameter({
      parameterLongName: '--ignore-scripts',
      description:
        'Do not execute any install lifecycle scripts specified in package.json files and its' +
        ' dependencies when "rush install". Running with this flag leaves your installation in a uncompleted' +
        ' state, you need to run without this flag again to complete a full installation. Meanwhile, it makes' +
        ' your installing faster. Later, you can run "rush install" to run all ignored scripts. Moreover, you' +
        ' can partial install such as "rush install --to <package>" to run ignored scripts of the dependencies' +
        ' of the selected projects.'
    });
  }

  protected async buildInstallOptionsAsync(): Promise<IInstallManagerOptions> {
    const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());

    const {
      pnpmFilterArguments,
      splitWorkspacePnpmFilterArguments,
      selectedProjects,
      hasSelectSplitWorkspaceProject
    } = await this._selectionParameters!.getPnpmFilterArgumentsAsync(terminal);

    // Warn when fully install without selecting any split workspace project
    if (
      this._includeSplitWorkspaceParameter &&
      !this._includeSplitWorkspaceParameter.value &&
      !this._selectionParameters?.isSelectionSpecified
    ) {
      terminal.writeWarningLine(
        'Run "rush install" without any selection parameter will not install for split workspace' +
          ' projects, please run the command again with specifying --include-split-workspace' +
          ' if you really want to install for split workspace projects.'
      );
      terminal.writeLine();
    }

    let includeSplitWorkspace: boolean = this._includeSplitWorkspaceParameter?.value ?? false;
    // turn on includeSplitWorkspace when selecting any split workspace project
    if (selectedProjects && hasSelectSplitWorkspaceProject) {
      includeSplitWorkspace = true;
    }

    return {
      debug: this.parser.isDebug,
      allowShrinkwrapUpdates: false,
      ignoreScripts: this._ignoreScriptsParameter.value!,
      bypassPolicy: this._bypassPolicyParameter.value!,
      noLink: this._noLinkParameter.value!,
      fullUpgrade: false,
      recheckShrinkwrap: false,
      includeSplitWorkspace,
      networkConcurrency: this._networkConcurrencyParameter.value,
      collectLogFile: this._debugPackageManagerParameter.value!,
      variant: this._variant.value,
      // Because the 'defaultValue' option on the _maxInstallAttempts parameter is set,
      // it is safe to assume that the value is not null
      maxInstallAttempts: this._maxInstallAttempts.value!,
      // These are derived independently of the selection for command line brevity
      pnpmFilterArguments,
      splitWorkspacePnpmFilterArguments,
      selectedProjects,
      selectionParameters: this._selectionParameters,
      checkOnly: this._checkOnlyParameter.value,

      beforeInstallAsync: () => this.rushSession.hooks.beforeInstall.promise(this)
    };
  }
}
