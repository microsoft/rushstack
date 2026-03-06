// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  FileSystem,
  InternalError,
  AlreadyReportedError,
  type FileSystemStats
} from '@rushstack/node-core-library';
import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { Colorize } from '@rushstack/terminal';

import type { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { BaseConfiglessRushAction } from './BaseRushAction.ts';
import { assetsFolderPath } from '../../utilities/PathConstants.ts';
import { copyTemplateFileAsync } from '../../utilities/templateUtilities.ts';

export class InitAction extends BaseConfiglessRushAction {
  private readonly _overwriteParameter: CommandLineFlagParameter;
  private readonly _rushExampleParameter: CommandLineFlagParameter;
  private readonly _experimentsParameter: CommandLineFlagParameter;

  // template section name --> whether it should be commented out
  private _commentedBySectionName: Map<string, boolean> = new Map<string, boolean>();

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init',
      summary: 'Initializes a new repository to be managed by Rush',
      documentation:
        'When invoked in an empty folder, this command provisions a standard' +
        ' set of config file templates to start managing projects using Rush.',
      parser
    });

    this._overwriteParameter = this.defineFlagParameter({
      parameterLongName: '--overwrite-existing',
      description:
        'By default "rush init" will not overwrite existing config files.' +
        ' Specify this switch to override that. This can be useful when upgrading' +
        ' your repo to a newer release of Rush. WARNING: USE WITH CARE!'
    });
    this._rushExampleParameter = this.defineFlagParameter({
      parameterLongName: '--rush-example-repo',
      description:
        'When copying the template config files, this uncomments fragments that are used' +
        ' by the "rush-example" GitHub repo, which is a sample monorepo that illustrates many Rush' +
        ' features. This option is primarily intended for maintaining that example.'
    });
    this._experimentsParameter = this.defineFlagParameter({
      parameterLongName: '--include-experiments',
      description:
        'Include features that may not be complete features, useful for demoing specific future features' +
        ' or current work in progress features.'
    });
  }

  protected async runAsync(): Promise<void> {
    const initFolder: string = process.cwd();

    if (!this._overwriteParameter.value) {
      if (!this._validateFolderIsEmpty(initFolder)) {
        throw new AlreadyReportedError();
      }
    }

    await this._copyTemplateFilesAsync(initFolder);
  }

  // Check whether it's safe to run "rush init" in the current working directory.
  private _validateFolderIsEmpty(initFolder: string): boolean {
    if (this.rushConfiguration !== undefined) {
      // eslint-disable-next-line no-console
      console.error(
        Colorize.red('ERROR: Found an existing configuration in: ' + this.rushConfiguration.rushJsonFile)
      );
      // eslint-disable-next-line no-console
      console.log(
        '\nThe "rush init" command must be run in a new folder without an existing Rush configuration.'
      );
      return false;
    }

    for (const itemName of FileSystem.readFolderItemNames(initFolder)) {
      if (itemName.substr(0, 1) === '.') {
        // Ignore any items that start with ".", for example ".git"
        continue;
      }

      const itemPath: string = path.join(initFolder, itemName);

      const stats: FileSystemStats = FileSystem.getStatistics(itemPath);
      // Ignore any loose files in the current folder, e.g. "README.md"
      // or "CONTRIBUTING.md"
      if (stats.isDirectory()) {
        // eslint-disable-next-line no-console
        console.error(Colorize.red(`ERROR: Found a subdirectory: "${itemName}"`));
        // eslint-disable-next-line no-console
        console.log('\nThe "rush init" command must be run in a new folder with no projects added yet.');
        return false;
      } else {
        if (itemName.toLowerCase() === 'package.json') {
          // eslint-disable-next-line no-console
          console.error(Colorize.red(`ERROR: Found a package.json file in this folder`));
          // eslint-disable-next-line no-console
          console.log('\nThe "rush init" command must be run in a new folder with no projects added yet.');
          return false;
        }
      }
    }
    return true;
  }

  private async _copyTemplateFilesAsync(initFolder: string): Promise<void> {
    // The "[dot]" base name is used for hidden files to prevent various tools from interpreting them.
    // For example, "npm publish" will always exclude the filename ".gitignore"
    const templateFilePaths: string[] = [
      '[dot]github/workflows/ci.yml',

      'common/config/rush/.pnpmfile.cjs',
      'common/config/rush/[dot]npmrc',
      'common/config/rush/[dot]npmrc-publish',
      'common/config/rush/artifactory.json',
      'common/config/rush/build-cache.json',
      'common/config/rush/cobuild.json',
      'common/config/rush/command-line.json',
      'common/config/rush/common-versions.json',
      'common/config/rush/custom-tips.json',
      'common/config/rush/experiments.json',
      'common/config/rush/pnpm-config.json',
      'common/config/rush/rush-plugins.json',
      'common/config/rush/subspaces.json',
      'common/config/rush/version-policies.json',

      'common/git-hooks/commit-msg.sample',

      '[dot]gitattributes',
      '[dot]gitignore',
      'rush.json'
    ];

    const experimentalTemplateFilePaths: string[] = ['common/config/rush/rush-alerts.json'];

    if (this._experimentsParameter.value) {
      templateFilePaths.push(...experimentalTemplateFilePaths);
    }

    const assetsSubfolder: string = `${assetsFolderPath}/rush-init`;

    for (const templateFilePath of templateFilePaths) {
      const sourcePath: string = path.join(assetsSubfolder, templateFilePath);

      if (!FileSystem.exists(sourcePath)) {
        // If this happens, please report a Rush bug
        throw new InternalError('Unable to find template input file: ' + sourcePath);
      }

      const destinationPath: string = path.join(initFolder, templateFilePath).replace('[dot]', '.');

      // The "DEMO" sections are uncommented only when "--rush-example-repo" is specified.
      await copyTemplateFileAsync(
        sourcePath,
        destinationPath,
        this._overwriteParameter.value,
        !this._rushExampleParameter.value
      );
    }
  }
}
