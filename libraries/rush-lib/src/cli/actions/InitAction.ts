// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  FileSystem,
  NewlineKind,
  InternalError,
  AlreadyReportedError,
  type FileSystemStats
} from '@rushstack/node-core-library';
import type { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { Colorize } from '@rushstack/terminal';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseConfiglessRushAction } from './BaseRushAction';

import { Rush } from '../../api/Rush';
import { assetsFolderPath } from '../../utilities/PathConstants';
import { RushConstants } from '../../logic/RushConstants';

// Matches a well-formed BEGIN macro starting a block section.
// Example:  /*[BEGIN "DEMO"]*/
//
// Group #1 is the indentation spaces before the macro
// Group #2 is the section name
const BEGIN_MARCO_REGEXP: RegExp = /^(\s*)\/\*\[BEGIN "([A-Z]+)"\]\s*\*\/\s*$/;

// Matches a well-formed END macro ending a block section.
// Example:  /*[END "DEMO"]*/
//
// Group #1 is the indentation spaces before the macro
// Group #2 is the section name
const END_MACRO_REGEXP: RegExp = /^(\s*)\/\*\[END "([A-Z]+)"\]\s*\*\/\s*$/;

// Matches a well-formed single-line section, including the space character after it
// if present.
// Example:  /*[LINE "HYPOTHETICAL"]*/
//
// Group #1 is the section name
const LINE_MACRO_REGEXP: RegExp = /\/\*\[LINE "([A-Z]+)"\]\s*\*\/\s?/;

// Matches a variable expansion.
// Example:  [%RUSH_VERSION%]
//
// Group #1 is the variable name including the dollar sign
const VARIABLE_MACRO_REGEXP: RegExp = /\[(%[A-Z0-9_]+%)\]/;

// Matches anything that starts with "/*[" and ends with "]*/"
// Used to catch malformed macro expressions
const ANY_MACRO_REGEXP: RegExp = /\/\*\s*\[.*\]\s*\*\//;

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

    this._defineMacroSections();
    this._copyTemplateFiles(initFolder);
  }

  private _defineMacroSections(): void {
    this._commentedBySectionName.clear();

    // The "HYPOTHETICAL" sections are always commented out by "rush init".
    // They are uncommented in the "assets" source folder so that we can easily validate
    // that they conform to their JSON schema.
    this._commentedBySectionName.set('HYPOTHETICAL', true);

    // The "DEMO" sections are uncommented only when "--rush-example-repo" is specified.
    this._commentedBySectionName.set('DEMO', !this._rushExampleParameter.value);
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

  private _copyTemplateFiles(initFolder: string): void {
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
      RushConstants.rushJsonFilename
    ];

    const experimentalTemplateFilePaths: string[] = [
      `common/config/rush/${RushConstants.subspacesConfigFilename}`
    ];

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

      this._copyTemplateFile(sourcePath, destinationPath);
    }
  }

  // Copy the template from sourcePath, transform any macros, and write the output to destinationPath.
  //
  // We implement a simple template engine.  "Single-line section" macros have this form:
  //
  //     /*[LINE "NAME"]*/ (content goes here)
  //
  // ...and when commented out will look like this:
  //
  //     // (content goes here)
  //
  // "Block section" macros have this form:
  //
  //     /*[BEGIN "NAME"]*/
  //     (content goes
  //     here)
  //     /*[END "NAME"]*/
  //
  // ...and when commented out will look like this:
  //
  //     // (content goes
  //     // here)
  //
  // Lastly, a variable expansion has this form:
  //
  //     // The value is [%NAME%].
  //
  // ...and when expanded with e.g. "123" will look like this:
  //
  //     // The value is 123.
  //
  // The section names must be one of the predefined names used by "rush init".
  // A single-line section may appear inside a block section, in which case it will get
  // commented twice.
  private _copyTemplateFile(sourcePath: string, destinationPath: string): void {
    const destinationFileExists: boolean = FileSystem.exists(destinationPath);

    if (!this._overwriteParameter.value) {
      if (destinationFileExists) {
        // eslint-disable-next-line no-console
        console.log(Colorize.yellow('Not overwriting already existing file: ') + destinationPath);
        return;
      }
    }

    if (destinationFileExists) {
      // eslint-disable-next-line no-console
      console.log(Colorize.yellow(`Overwriting: ${destinationPath}`));
    } else {
      // eslint-disable-next-line no-console
      console.log(`Generating: ${destinationPath}`);
    }

    const outputLines: string[] = [];
    const lines: string[] = FileSystem.readFile(sourcePath, { convertLineEndings: NewlineKind.Lf }).split(
      '\n'
    );

    let activeBlockSectionName: string | undefined = undefined;
    let activeBlockIndent: string = '';

    for (const line of lines) {
      let match: RegExpMatchArray | null;

      // Check for a block section start
      // Example:  /*[BEGIN "DEMO"]*/
      match = line.match(BEGIN_MARCO_REGEXP);
      if (match) {
        if (activeBlockSectionName) {
          // If this happens, please report a Rush bug
          throw new InternalError(
            `The template contains an unmatched BEGIN macro for "${activeBlockSectionName}"`
          );
        }

        activeBlockSectionName = match[2];
        activeBlockIndent = match[1];
        // Remove the entire line containing the macro
        continue;
      }

      // Check for a block section end
      // Example:  /*[END "DEMO"]*/
      match = line.match(END_MACRO_REGEXP);
      if (match) {
        if (activeBlockSectionName === undefined) {
          // If this happens, please report a Rush bug
          throw new InternalError(
            `The template contains an unmatched END macro for "${activeBlockSectionName}"`
          );
        }

        if (activeBlockSectionName !== match[2]) {
          // If this happens, please report a Rush bug
          throw new InternalError(
            `The template contains an mismatched END macro for "${activeBlockSectionName}"`
          );
        }

        if (activeBlockIndent !== match[1]) {
          // If this happens, please report a Rush bug
          throw new InternalError(
            `The template contains an inconsistently indented section "${activeBlockSectionName}"`
          );
        }

        activeBlockSectionName = undefined;

        // Remove the entire line containing the macro
        continue;
      }

      let transformedLine: string = line;

      // Check for a single-line section
      // Example:  /*[LINE "HYPOTHETICAL"]*/
      match = transformedLine.match(LINE_MACRO_REGEXP);
      if (match) {
        const sectionName: string = match[1];
        const replacement: string = this._isSectionCommented(sectionName) ? '// ' : '';
        transformedLine = transformedLine.replace(LINE_MACRO_REGEXP, replacement);
      }

      // Check for variable expansions
      // Example:  [%RUSH_VERSION%]
      while ((match = transformedLine.match(VARIABLE_MACRO_REGEXP))) {
        const variableName: string = match[1];
        const replacement: string = this._expandMacroVariable(variableName);
        transformedLine = transformedLine.replace(VARIABLE_MACRO_REGEXP, replacement);
      }

      // Verify that all macros were handled
      match = transformedLine.match(ANY_MACRO_REGEXP);
      if (match) {
        // If this happens, please report a Rush bug
        throw new InternalError(
          'The template contains a malformed macro expression: ' + JSON.stringify(match[0])
        );
      }

      // If we are inside a block section that is commented out, then insert the "//" after indentation
      if (activeBlockSectionName !== undefined) {
        if (this._isSectionCommented(activeBlockSectionName)) {
          // Is the line indented properly?
          if (transformedLine.substr(0, activeBlockIndent.length).trim().length > 0) {
            // If this happens, please report a Rush bug
            throw new InternalError(
              `The template contains inconsistently indented lines inside` +
                ` the "${activeBlockSectionName}" section`
            );
          }

          // Insert comment characters after the indentation
          const contentAfterIndent: string = transformedLine.substr(activeBlockIndent.length);
          transformedLine = activeBlockIndent + '// ' + contentAfterIndent;
        }
      }

      outputLines.push(transformedLine);
    }

    // Write the output
    FileSystem.writeFile(destinationPath, outputLines.join('\n'), {
      ensureFolderExists: true
    });
  }

  private _isSectionCommented(sectionName: string): boolean {
    const value: boolean | undefined = this._commentedBySectionName.get(sectionName);
    if (value === undefined) {
      // If this happens, please report a Rush bug
      throw new InternalError(`The template references an undefined section name ${sectionName}`);
    }

    return value!;
  }

  private _expandMacroVariable(variableName: string): string {
    switch (variableName) {
      case '%RUSH_VERSION%':
        return Rush.version;
      default:
        throw new InternalError(`The template references an undefined variable "${variableName}"`);
    }
  }
}
