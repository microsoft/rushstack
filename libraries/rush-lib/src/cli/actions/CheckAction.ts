// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import { Colorize } from '@rushstack/terminal';

import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { BaseRushAction } from './BaseRushAction.ts';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder.ts';
import { getVariantAsync, VARIANT_PARAMETER } from '../../api/Variants.ts';

export class CheckAction extends BaseRushAction {
  private readonly _jsonFlag: CommandLineFlagParameter;
  private readonly _verboseFlag: CommandLineFlagParameter;
  private readonly _subspaceParameter: CommandLineStringParameter | undefined;
  private readonly _variantParameter: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'check',
      summary:
        "Checks each project's package.json files and ensures that all dependencies are of the same " +
        'version throughout the repository.',
      documentation:
        "Checks each project's package.json files and ensures that all dependencies are of the " +
        'same version throughout the repository.',
      safeForSimultaneousRushProcesses: true,
      parser
    });

    this._jsonFlag = this.defineFlagParameter({
      parameterLongName: '--json',
      description: 'If this flag is specified, output will be in JSON format.'
    });
    this._verboseFlag = this.defineFlagParameter({
      parameterLongName: '--verbose',
      description:
        'If this flag is specified, long lists of package names will not be truncated. ' +
        `This has no effect if the ${this._jsonFlag.longName} flag is also specified.`
    });
    this._subspaceParameter = this.defineStringParameter({
      parameterLongName: '--subspace',
      argumentName: 'SUBSPACE_NAME',
      description:
        '(EXPERIMENTAL) Specifies an individual Rush subspace to check, requiring versions to be ' +
        'consistent only within that subspace (ignoring other subspaces). This parameter is required when ' +
        'the "subspacesEnabled" setting is set to true in subspaces.json.'
    });
    this._variantParameter = this.defineStringParameter(VARIANT_PARAMETER);
  }

  protected async runAsync(): Promise<void> {
    if (this.rushConfiguration.subspacesFeatureEnabled && !this._subspaceParameter) {
      throw new Error(
        `The --subspace parameter must be specified with "rush check" when subspaces is enabled.`
      );
    }

    const currentlyInstalledVariant: string | undefined =
      await this.rushConfiguration.getCurrentlyInstalledVariantAsync();
    const variant: string | undefined = await getVariantAsync(
      this._variantParameter,
      this.rushConfiguration,
      true
    );
    if (!variant && currentlyInstalledVariant) {
      this.terminal.writeWarningLine(
        Colorize.yellow(
          `Variant '${currentlyInstalledVariant}' has been installed, but 'rush check' is currently checking the default variant. ` +
            `Use 'rush ${this.actionName} ${this._variantParameter.longName} '${currentlyInstalledVariant}' to check the current installation.`
        )
      );
    }

    VersionMismatchFinder.rushCheck(this.rushConfiguration, this.terminal, {
      variant,
      printAsJson: this._jsonFlag.value,
      truncateLongPackageNameLists: !this._verboseFlag.value,
      subspace: this._subspaceParameter?.value
        ? this.rushConfiguration.getSubspace(this._subspaceParameter.value)
        : this.rushConfiguration.defaultSubspace
    });
  }
}
