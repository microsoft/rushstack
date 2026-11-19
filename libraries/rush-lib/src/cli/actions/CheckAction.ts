// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import { Colorize } from '@rushstack/terminal';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder';
import { getVariantAsync, VARIANT_PARAMETER } from '../../api/Variants';

export class CheckAction extends BaseRushAction {
  readonly #jsonFlag: CommandLineFlagParameter;
  readonly #verboseFlag: CommandLineFlagParameter;
  readonly #subspaceParameter: CommandLineStringParameter | undefined;
  readonly #variantParameter: CommandLineStringParameter;

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

    this.#jsonFlag = this.defineFlagParameter({
      parameterLongName: '--json',
      description: 'If this flag is specified, output will be in JSON format.'
    });
    this.#verboseFlag = this.defineFlagParameter({
      parameterLongName: '--verbose',
      description:
        'If this flag is specified, long lists of package names will not be truncated. ' +
        `This has no effect if the ${this.#jsonFlag.longName} flag is also specified.`
    });
    this.#subspaceParameter = this.defineStringParameter({
      parameterLongName: '--subspace',
      argumentName: 'SUBSPACE_NAME',
      description:
        '(EXPERIMENTAL) Specifies an individual Rush subspace to check, requiring versions to be ' +
        'consistent only within that subspace (ignoring other subspaces). This parameter is required when ' +
        'the "subspacesEnabled" setting is set to true in subspaces.json.'
    });
    this.#variantParameter = this.defineStringParameter(VARIANT_PARAMETER);
  }

  protected async runAsync(): Promise<void> {
    if (this.rushConfiguration.subspacesFeatureEnabled && !this.#subspaceParameter) {
      throw new Error(
        `The --subspace parameter must be specified with "rush check" when subspaces is enabled.`
      );
    }

    const currentlyInstalledVariant: string | undefined =
      await this.rushConfiguration.getCurrentlyInstalledVariantAsync();
    const variant: string | undefined = await getVariantAsync(
      this.#variantParameter,
      this.rushConfiguration,
      true
    );
    if (!variant && currentlyInstalledVariant) {
      this.terminal.writeWarningLine(
        Colorize.yellow(
          `Variant '${currentlyInstalledVariant}' has been installed, but 'rush check' is currently checking the default variant. ` +
            `Use 'rush ${this.actionName} ${this.#variantParameter.longName} '${currentlyInstalledVariant}' to check the current installation.`
        )
      );
    }

    VersionMismatchFinder.rushCheck(this.rushConfiguration, this.terminal, {
      variant,
      printAsJson: this.#jsonFlag.value,
      truncateLongPackageNameLists: !this.#verboseFlag.value,
      subspace: this.#subspaceParameter?.value
        ? this.rushConfiguration.getSubspace(this.#subspaceParameter.value)
        : this.rushConfiguration.defaultSubspace
    });
  }
}
