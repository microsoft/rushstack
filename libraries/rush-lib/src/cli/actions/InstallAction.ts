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

export class InstallAction extends BaseInstallAction {
  private readonly _checkOnlyParameter: CommandLineFlagParameter;
  private readonly _resolutionOnlyParameter: CommandLineFlagParameter | undefined;

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

    this._checkOnlyParameter = this.defineFlagParameter({
      parameterLongName: '--check-only',
      description: `Only check the validity of the shrinkwrap file without performing an install.`
    });

    if (this.rushConfiguration?.isPnpm) {
      this._resolutionOnlyParameter = this.defineFlagParameter({
        parameterLongName: '--resolution-only',
        description: `Only perform dependency resolution, useful for ensuring peer dependendencies are up to date. Note that this flag is only supported when using the pnpm package manager.`
      });
    }
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
      allowShrinkwrapUpdates: false,
      bypassPolicyAllowed: true,
      bypassPolicy: this._bypassPolicyParameter.value!,
      noLink: this._noLinkParameter.value!,
      fullUpgrade: false,
      recheckShrinkwrap: false,
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
      checkOnly: this._checkOnlyParameter.value,
      resolutionOnly: this._resolutionOnlyParameter?.value,
      beforeInstallAsync: (subspace: Subspace) =>
        this.rushSession.hooks.beforeInstall.promise(this, subspace, variant),
      afterInstallAsync: (subspace: Subspace) =>
        this.rushSession.hooks.afterInstall.promise(this, subspace, variant),
      terminal: this.terminal
    };
  }
}
