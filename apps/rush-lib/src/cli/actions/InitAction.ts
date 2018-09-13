// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseConfiglessRushAction } from './BaseRushAction';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { FileSystem, NewlineKind } from '@microsoft/node-core-library';
import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

export class InitAction extends BaseConfiglessRushAction {
  // Matches a well-formed BEGIN macro starting a multi-line section.
  // Example:  /*[BEGIN "DEMO"]*/
  //
  // Group #1 is the indentation spaces before the macro
  // Group #2 is the section name
  private static _beginMacroRegExp: RegExp = /^(\s*)\/\*\[BEGIN "([A-Z]+)"\]\s*\*\/\s*$/;

  // Matches a well-formed END macro ending a multi-line section.
  // Example:  /*[END "DEMO"]*/
  //
  // Group #1 is the indentation spaces before the macro
  // Group #2 is the section name
  private static _endMacroRegExp: RegExp = /^(\s*)\/\*\[END "([A-Z]+)"\]\s*\*\/\s*$/;

  // Matches a well-formed single-line section.
  // Example:  /*[LINE "HYPOTHETICAL"]*/
  //
  // Group #1 is the section name
  private static _lineMacroRegExp: RegExp = /\/\*\[LINE "([A-Z]+)"\]\s*\*\//;

  // Matches anything that starts with "/*[" and ends with "]*/"
  // Used to catch malformed macro expressions
  private static _anyMacroRegExp: RegExp = /\/\*\s*\[.*\]\s*\*\//;

  private _overwriteParameter: CommandLineFlagParameter;
  private _rushExampleParameter: CommandLineFlagParameter;

  // template section name --> whether it should be commented out
  private _commentedBySectionName: Map<string, boolean> = new Map<string, boolean>();

  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'init',
      summary: 'Initializes a new repository to be managed by Rush',
      documentation: 'When invoked in an empty folder, this command provisions a standard'
        + ' set of config file templates to start managing projects using Rush.',
      parser
    });
  }

  protected onDefineParameters(): void { // abstract
    this._overwriteParameter = this.defineFlagParameter({
      parameterLongName: '--overwrite-existing',
      description: 'By default "rush init" will not overwrite existing config files.'
        + ' Specify this switch to override that. This can be useful when upgrading'
        + ' your repo to a newer release of Rush. WARNING: USE WITH CARE!'
    });
    this._rushExampleParameter = this.defineFlagParameter({
      parameterLongName: '--rush-example-repo',
      description: 'When copying the template config files, this uncomments fragments that are used'
        + ' by the "rush-example" GitHub repo, which is a sample monorepo that illustrates many Rush'
        + ' features. This option is primarily intended for maintaining that example.'
    });
  }

  protected run(): Promise<void> {
    const initFolder: string = process.cwd();

    if (!this._overwriteParameter.value) {
      if (!this._validateFolderIsEmpty(initFolder)) {
        return Promise.reject(new AlreadyReportedError());
      }
    }

    this._commentedBySectionName.clear();

    // The HYPOTHETICAL section is always commented out
    this._commentedBySectionName.set('HYPOTHETICAL', true);

    // The DEMO section is NOT commented if --rush-example-repo was specified
    this._commentedBySectionName.set('DEMO', !this._rushExampleParameter.value);

    this._copyTemplateFiles(initFolder);

    return Promise.resolve();
  }

  private _validateFolderIsEmpty(initFolder: string): boolean {
    if (this.rushConfiguration !== undefined) {
      console.error(colors.red('ERROR: Found an existing configuration in: '
      + this.rushConfiguration.rushJsonFile));
      console.log(os.EOL + 'The "rush init" command must be run in a new folder without '
        + 'an existing Rush configuration.');
      return false;
    }

    for (const itemName of FileSystem.readFolder(initFolder)) {
      if (itemName.substr(0, 1) === '.') {
        // Ignore any items that start with ".", for example ".git"
        continue;
      }

      const itemPath: string = path.join(initFolder, itemName);

      const stats: fs.Stats = FileSystem.getStatistics(itemPath);
      // Ignore any loose files in the current folder, e.g. "README.md"
      // or "CONTRIBUTING.md"
      if (stats.isDirectory()) {
        console.error(colors.red(`ERROR: Found a subdirectory: "${itemName}"`));
        console.log(os.EOL + 'The "rush init" command must be run in a new folder with no projects added yet.');
        return false;
      } else {
        if (itemName.toLowerCase() === 'package.json') {
          console.error(colors.red(`ERROR: Found a package.json file in this folder`));
          console.log(os.EOL + 'The "rush init" command must be run in a new folder with no projects added yet.');
          return false;
        }
      }
    }
    return true;
  }

  private _copyTemplateFiles(initFolder: string): void {
    const templateFilePaths: string[] = [
      'rush.json',
      '.gitattributes',
      '.gitignore',
      '.travis.yml',
      'common/config/rush/.npmrc',
      'common/config/rush/command-line.json',
      'common/config/rush/common-versions.json',
      'common/config/rush/pnpmfile.js',
      'common/config/rush/version-policies.json'
    ];

    const assetsSubfolder: string = path.resolve(__dirname, '../../../assets/rush-init');

    for (const templateFilePath of templateFilePaths) {
      const sourcePath: string = path.join(assetsSubfolder, templateFilePath);

      if (!FileSystem.exists(sourcePath)) {
        // If this happens, please report a Rush bug
        throw new Error('Unable to find template input file: ' + sourcePath);
      }

      this._copyTemplateFile(sourcePath, path.join(initFolder, templateFilePath));
    }
  }

  private _copyTemplateFile(sourcePath: string, destinationPath: string): void {
    if (!this._overwriteParameter.value) {
      if (FileSystem.exists(destinationPath)) {
        console.log(colors.yellow('Not overwriting already existing file: ') + destinationPath);
        return;
      }
    }

    if (FileSystem.exists(destinationPath)) {
      console.log(colors.yellow(`Overwriting: ${destinationPath}`));
    } else {
      console.log(`Generating: ${destinationPath}`);
    }

    const outputLines: string[] = [];
    const lines: string[] = FileSystem.readFile(sourcePath, { convertLineEndings: NewlineKind.Lf })
      .split('\n');

    let activeMultiLineSectionName: string | undefined = undefined;
    let activeMultiLineIndent: string = '';

    for (const line of lines) {
      let transformedLine: string = line;

      let match: RegExpMatchArray | null;

      // Check for a multi-line start
      // Example:  /*[BEGIN "DEMO"]*/
      match = line.match(InitAction._beginMacroRegExp);
      if (match) {
        if (activeMultiLineSectionName) {
          // If this happens, please report a Rush bug
          throw new Error(`The template contains an unmatched BEGIN macro for "${activeMultiLineSectionName}"`);
        }

        activeMultiLineSectionName = match[2];
        activeMultiLineIndent = match[1];
        // Remove the entire line containing the macro
        continue;
      }

      // Check for a multi-line end
      // Example:  /*[END "DEMO"]*/
      match = line.match(InitAction._endMacroRegExp);
      if (match) {
        if (activeMultiLineSectionName === undefined) {
          // If this happens, please report a Rush bug
          throw new Error(`The template contains an unmatched END macro for "${activeMultiLineSectionName}"`);
        }

        if (activeMultiLineSectionName !== match[2]) {
          // If this happens, please report a Rush bug
          throw new Error(`The template contains an mismatched END macro for "${activeMultiLineSectionName}"`);
        }

        if (activeMultiLineIndent !== match[1]) {
          // If this happens, please report a Rush bug
          throw new Error(`The template contains an inconsistently indented section "${activeMultiLineSectionName}"`);
        }

        activeMultiLineSectionName = undefined;

        // Remove the entire line containing the macro
        continue;
      }

      // Check for a single-line section
      // Example:  /*[LINE "HYPOTHETICAL"]*/
      match = line.match(InitAction._lineMacroRegExp);
      if (match) {
        const sectionName: string = match[1];
        const replacement: string = this._isSectionCommented(sectionName) ? '//' : '';
        transformedLine = line.replace(InitAction._lineMacroRegExp, replacement);
      }

      // Verify that all macros were handled
      match = transformedLine.match(InitAction._anyMacroRegExp);
      if (match) {
        // If this happens, please report a Rush bug
        throw new Error('The template contains a malformed macro expression: ' + JSON.stringify(match[0]));
      }

      // If we are inside a multi-line range that is commented out, then insert the "//" after indentation
      if (activeMultiLineSectionName !== undefined) {
        if (this._isSectionCommented(activeMultiLineSectionName)) {
          // Is the line indented properly?
          if (transformedLine.substr(0, activeMultiLineIndent.length).trim().length > 0) {
            // If this happens, please report a Rush bug
            throw new Error(`The template contains inconsistently indented lines inside`
              + ` the "${activeMultiLineSectionName}" section`);
          }

          // Insert comment characters after the indentation
          const contentAfterIndent: string = transformedLine.substr(activeMultiLineIndent.length);
          transformedLine = activeMultiLineIndent + '// ' + contentAfterIndent;
        }
      }

      outputLines.push(transformedLine);
    }

    // Write the output
    FileSystem.writeFile(destinationPath, outputLines.join('\r\n'), {
      ensureFolderExists: true
    });
  }

  private _isSectionCommented(sectionName: string): boolean {
    const value: boolean | undefined = this._commentedBySectionName.get(sectionName);
    if (value === undefined) {
      // If this happens, please report a Rush bug
      throw new Error(`The template references an undefined section name ${sectionName}`);
    }

    return value!;
  }
}
