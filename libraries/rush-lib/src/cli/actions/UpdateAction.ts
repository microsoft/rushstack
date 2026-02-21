// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BaseInstallAction } from './BaseInstallAction.ts';
import type { IInstallManagerOptions } from '../../logic/base/BaseInstallManagerTypes.ts';
import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { SelectionParameterSet } from '../parsing/SelectionParameterSet.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import type { Subspace } from '../../api/Subspace.ts';
import { getVariantAsync } from '../../api/Variants.ts';

export class UpdateAction extends BaseInstallAction {
  private readonly _fullParameter: CommandLineFlagParameter;
  private readonly _recheckParameter: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'update',
      summary:
        'Install package dependencies for all projects in the repo,' +
        ' and create or update the shrinkwrap file as needed',
      documentation:
        'The "rush update" command installs the dependencies described in your' +
        ' package.json files, and updates the shrinkwrap file as needed.' +
        ' (This "shrinkwrap" file stores a central inventory of all dependencies and versions' +
        ' for projects in your repo. It is found in the "common/config/rush" folder.)' +
        ' Note that Rush always performs a single install for all projects in your repo.' +
        ' You should run "rush update" whenever you start working in a Rush repo,' +
        ' after you pull from Git, and after you modify a package.json file.' +
        ' If there is nothing to do, "rush update" is instantaneous.' +
        ' NOTE: In certain cases "rush install" should be used instead of "rush update"' +
        ' -- for details, see the command help for "rush install".',
      parser
    });

    if (this.rushConfiguration?.subspacesFeatureEnabled) {
      // Partial update is supported only when subspaces is enabled.
      this._selectionParameters = new SelectionParameterSet(this.rushConfiguration, this, {
        gitOptions: {
          // Include lockfile processing since this expands the selection, and we need to select
          // at least the same projects selected with the same query to "rush build"
          includeExternalDependencies: true,
          // Disable filtering because rush-project.json is riggable and therefore may not be available
          enableFiltering: false
        },
        includeSubspaceSelector: true,
        cwd: this.parser.cwd
      });
    }

    this._fullParameter = this.defineFlagParameter({
      parameterLongName: '--full',
      description:
        'Normally "rush update" tries to preserve your existing installed versions' +
        ' and only makes the minimum updates needed to satisfy the package.json files.' +
        ' This conservative approach prevents your PR from getting involved with package updates that' +
        ' are unrelated to your work. Use "--full" when you really want to update all dependencies' +
        ' to the latest SemVer-compatible version.  This should be done periodically by a person' +
        ' or robot whose role is to deal with potential upgrade regressions.'
    });
    this._recheckParameter = this.defineFlagParameter({
      parameterLongName: '--recheck',
      description:
        'If the shrinkwrap file appears to already satisfy the package.json files,' +
        ' then "rush update" will skip invoking the package manager at all.  In certain situations' +
        ' this heuristic may be inaccurate.  Use the "--recheck" flag to force the package manager' +
        " to process the shrinkwrap file.  This will also update your shrinkwrap file with Rush's fixups." +
        ' (To minimize shrinkwrap churn, these fixups are normally performed only in the temporary folder.)'
    });
  }

  protected async runAsync(): Promise<void> {
    await this.parser.pluginManager.updateAsync();

    if (this.parser.pluginManager.error) {
      await this.parser.pluginManager.reinitializeAllPluginsForCommandAsync(this.actionName);
    }

    return super.runAsync();
  }

  protected async buildInstallOptionsAsync(): Promise<Omit<IInstallManagerOptions, 'subspace'>> {
    const selectedProjects: Set<RushConfigurationProject> =
      (await this._selectionParameters?.getSelectedProjectsAsync(this.terminal)) ??
      new Set(this.rushConfiguration.projects);

    const variant: string | undefined = await getVariantAsync(
      this._variantParameter,
      this.rushConfiguration,
      false
    );

    return {
      debug: this.parser.isDebug,
      allowShrinkwrapUpdates: true,
      bypassPolicyAllowed: true,
      bypassPolicy: this._bypassPolicyParameter.value!,
      noLink: this._noLinkParameter.value!,
      fullUpgrade: this._fullParameter.value!,
      recheckShrinkwrap: this._recheckParameter.value!,
      offline: this._offlineParameter.value!,
      networkConcurrency: this._networkConcurrencyParameter.value,
      collectLogFile: this._debugPackageManagerParameter.value!,
      variant,
      // Because the 'defaultValue' option on the _maxInstallAttempts parameter is set,
      // it is safe to assume that the value is not null
      maxInstallAttempts: this._maxInstallAttempts.value!,
      // These are derived independently of the selection for command line brevity
      selectedProjects,
      pnpmFilterArgumentValues:
        (await this._selectionParameters?.getPnpmFilterArgumentValuesAsync(this.terminal)) ?? [],
      checkOnly: false,
      beforeInstallAsync: (subspace: Subspace) =>
        this.rushSession.hooks.beforeInstall.promise(this, subspace, variant),
      afterInstallAsync: (subspace: Subspace) =>
        this.rushSession.hooks.afterInstall.promise(this, subspace, variant),
      terminal: this.terminal
    };
  }
}
