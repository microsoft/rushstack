// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as semver from 'semver';

import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BaseAddAndRemoveAction, PACKAGE_PARAMETER_NAME } from './BaseAddAndRemoveAction.ts';
import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { DependencySpecifier } from '../../logic/DependencySpecifier.ts';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject.ts';
import {
  type IPackageForRushAdd,
  type IPackageJsonUpdaterRushAddOptions,
  SemVerStyle
} from '../../logic/PackageJsonUpdaterTypes.ts';
import { getVariantAsync } from '../../api/Variants.ts';

const ADD_ACTION_NAME: 'add' = 'add';
export const MAKE_CONSISTENT_FLAG_NAME: '--make-consistent' = '--make-consistent';
const EXACT_FLAG_NAME: '--exact' = '--exact';
const CARET_FLAG_NAME: '--caret' = '--caret';

export class AddAction extends BaseAddAndRemoveAction {
  private readonly _exactFlag: CommandLineFlagParameter;
  private readonly _caretFlag: CommandLineFlagParameter;
  private readonly _devDependencyFlag: CommandLineFlagParameter;
  private readonly _peerDependencyFlag: CommandLineFlagParameter;
  private readonly _makeConsistentFlag: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    const documentation: string = [
      'Adds specified package(s) to the dependencies of the current project (as determined by the current working directory)' +
        ' and then runs "rush update". If no version is specified, a version will be automatically detected (typically' +
        ' either the latest version or a version that won\'t break the "ensureConsistentVersions" policy). If a version' +
        ' range (or a workspace range) is specified, the latest version in the range will be used. The version will be' +
        ` automatically prepended with a tilde, unless the "${EXACT_FLAG_NAME}" or "${CARET_FLAG_NAME}" flags are used.` +
        ` The "${MAKE_CONSISTENT_FLAG_NAME}" flag can be used to update all packages with the dependency.`
    ].join('\n');
    super({
      actionName: ADD_ACTION_NAME,
      summary: 'Adds one or more dependencies to the package.json and runs rush update.',
      documentation,
      safeForSimultaneousRushProcesses: false,
      parser,
      allFlagDescription: 'If specified, the dependency will be added to all projects.',
      packageNameListParameterDescription:
        'The name of the package which should be added as a dependency.' +
        ' A SemVer version specifier can be appended after an "@" sign.  WARNING: Symbol characters' +
        " are usually interpreted by your shell, so it's recommended to use quotes." +
        ` For example, write "rush add ${PACKAGE_PARAMETER_NAME} "example@^1.2.3"" instead of "rush add ${PACKAGE_PARAMETER_NAME} example@^1.2.3".` +
        ` To add multiple packages, write "rush add ${PACKAGE_PARAMETER_NAME} foo ${PACKAGE_PARAMETER_NAME} bar".`
    });

    this._exactFlag = this.defineFlagParameter({
      parameterLongName: EXACT_FLAG_NAME,
      description:
        'If specified, the SemVer specifier added to the' +
        ' package.json will be an exact version (e.g. without tilde or caret).'
    });
    this._caretFlag = this.defineFlagParameter({
      parameterLongName: CARET_FLAG_NAME,
      description:
        'If specified, the SemVer specifier added to the' +
        ' package.json will be a prepended with a "caret" specifier ("^").'
    });
    this._devDependencyFlag = this.defineFlagParameter({
      parameterLongName: '--dev',
      description:
        'If specified, the package will be added to the "devDependencies" section of the package.json'
    });
    this._peerDependencyFlag = this.defineFlagParameter({
      parameterLongName: '--peer',
      description:
        'If specified, the package will be added to the "peerDependencies" section of the package.json'
    });
    this._makeConsistentFlag = this.defineFlagParameter({
      parameterLongName: MAKE_CONSISTENT_FLAG_NAME,
      parameterShortName: '-m',
      description:
        'If specified, other packages with this dependency will have their package.json' +
        ' files updated to use the same version of the dependency.'
    });
  }

  public async getUpdateOptionsAsync(): Promise<IPackageJsonUpdaterRushAddOptions> {
    const projects: RushConfigurationProject[] = super.getProjects();

    if (this._caretFlag.value && this._exactFlag.value) {
      throw new Error(
        `Only one of "${this._caretFlag.longName}" and "${this._exactFlag.longName}" should be specified`
      );
    }

    const packagesToAdd: IPackageForRushAdd[] = [];

    for (const specifiedPackageName of this.specifiedPackageNameList) {
      /**
       * Name & Version
       */
      let packageName: string = specifiedPackageName;
      let version: string | undefined = undefined;
      const parts: string[] = packageName.split('@');

      if (parts[0] === '') {
        // this is a scoped package
        packageName = '@' + parts[1];
        version = parts[2];
      } else {
        packageName = parts[0];
        version = parts[1];
      }

      if (!this.rushConfiguration.packageNameParser.isValidName(packageName)) {
        throw new Error(`The package name "${packageName}" is not valid.`);
      }

      if (version && version !== 'latest') {
        const specifier: DependencySpecifier = new DependencySpecifier(packageName, version);
        if (!semver.validRange(specifier.versionSpecifier) && !semver.valid(specifier.versionSpecifier)) {
          throw new Error(`The SemVer specifier "${version}" is not valid.`);
        }
      }

      /**
       * RangeStyle
       */
      let rangeStyle: SemVerStyle;
      if (version && version !== 'latest') {
        if (this._exactFlag.value || this._caretFlag.value) {
          throw new Error(
            `The "${this._caretFlag.longName}" and "${this._exactFlag.longName}" flags may not be specified if a ` +
              `version is provided in the ${this._packageNameListParameter.longName} specifier. In this case "${version}" was provided.`
          );
        }

        rangeStyle = SemVerStyle.Passthrough;
      } else {
        rangeStyle = this._caretFlag.value
          ? SemVerStyle.Caret
          : this._exactFlag.value
            ? SemVerStyle.Exact
            : SemVerStyle.Tilde;
      }

      packagesToAdd.push({ packageName, version, rangeStyle });
    }

    const variant: string | undefined = await getVariantAsync(
      this._variantParameter,
      this.rushConfiguration,
      true
    );

    return {
      projects,
      packagesToUpdate: packagesToAdd,
      devDependency: this._devDependencyFlag.value,
      peerDependency: this._peerDependencyFlag.value,
      updateOtherPackages: this._makeConsistentFlag.value,
      skipUpdate: this._skipUpdateFlag.value,
      debugInstall: this.parser.isDebug,
      actionName: this.actionName,
      variant
    };
  }
}
