// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as child_process from 'child_process';
import gitInfo = require('git-repo-info');

import inquirer = require('inquirer');

import { CommandLineAction,
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';

import {
  RushConfiguration,
  RushConfigurationProject,
  IChangeFile,
  IChangeInfo,
  VersionControl
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';
import PublishUtilities from '../utilities/PublishUtilities';

const BUMP_OPTIONS: { [type: string]: string } = {
  'major': 'major - for breaking changes (ex: renaming a file)',
  'minor': 'minor - for adding new features (ex: exposing a new public API)',
  'patch': 'patch - for fixes (ex: updating how an API works w/o touching its signature)'
};

export default class ChangeAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfiguration: RushConfiguration;
  private _sortedProjectList: string[];
  private _changeFileData: IChangeFile;
  private _verifyParameter: CommandLineFlagParameter;
  private _targetBranch: CommandLineStringParameter;

  private _prompt: inquirer.PromptModule;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'change',
      summary: 'Record a change made to a package which indicate how the package version number should be bumped.',
      documentation: ['Asks a series of questions and then generates a <branchname>-<timstamp>.json file which is ' +
        ' stored in the common folder. Later, run the `version-bump` command to actually perform the proper ' +
        ' version bumps. Note these changes will eventually be published in the packages\' changelog.md files.',
        '',
        'Here\'s some help in figuring out what kind of change you are making: ',
        '',
        'MAJOR - these are breaking changes that are not backwards compatible. ' +
        'Examples are: renaming a class, adding/removing a non-optional ' +
        'parameter from a public API, or renaming an variable or function that ' +
        'is exported.',
        '',
        'MINOR - these are changes that are backwards compatible (but not ' +
        'forwards compatible). Examples are: adding a new public API or adding an ' +
        'optional parameter to a public API',
        '',
        'PATCH - these are changes that are backwards and forwards compatible. ' +
        'Examples are: Modifying a private API or fixing a bug in the logic ' +
        'of how an existing API works.',
        ''].join(os.EOL)
    });
    this._parser = parser;
  }

  public onDefineParameters(): void {
    this._verifyParameter = this.defineFlagParameter({
      parameterLongName: '--verify',
      parameterShortName: '-v',
      description: 'Verify the change log file is generated and is a valid JSON file'
    });
    this._targetBranch = this.defineStringParameter({
      parameterLongName: '--target-branch',
      parameterShortName: '-b',
      description:
      'If this flag is specified, compare current branch with the target branch to get changes.'
    });
  }

  public onExecute(): void {
    this._rushConfiguration = RushConfiguration.loadFromDefaultLocation();
    if (this._verifyParameter.value) {
      return this._verify();
    }
    this._sortedProjectList = this._getChangedPackageNames()
       .sort();

    if (this._sortedProjectList.length === 0) {
      console.log('No change file is needed.');
      return;
    }

    this._prompt = inquirer.createPromptModule();
    this._changeFileData = {
      changes: [],
      email: undefined
    };

    // We should consider making onExecute either be an async/await or have it return a promise
    this._promptLoop()
      .catch((error: Error) => {
        console.error('There was an issue creating the changefile:' + os.EOL + error.toString());
      });
  }

  private _verify(): void {
    const changedPackages: string[] = this._getChangedPackageNames();

    if (changedPackages.length > 0) {
      this._validateChangeFile(changedPackages);
    } else {
      console.log('No change is needed.');
    }
  }

  private _getChangedPackageNames(): string[] {
    const changedFolders: string[] = VersionControl.getChangedFolders(this._targetBranch.value);
    return this._rushConfiguration.projects
      .filter(project => project.shouldPublish)
      .filter(project => this._hasProjectChanged(changedFolders, project))
      .map(project => project.packageName);
  }

  private _validateChangeFile(changedPackages: string[]): void {
    const changeFiles: string[] = this._getChangeFiles();
    if (changeFiles.length === 1) {
      console.log('Found one change file: ' + changeFiles[0]);
      this._validateChangedProjects(changeFiles[0], changedPackages);
    } else if (changeFiles.length === 0) {
      throw new Error(`No change file is found. Run 'rush change' to generate a change file.`);
    } else {
      throw new Error('More than one change file was found. Delete and only keep one.');
    }
  }

  private _validateChangedProjects(changeFile: string,
    changedPackages: string[]): void {
    const fileFullPath: string = path.join(this._rushConfiguration.rushJsonFolder, changeFile);
    const missingPackages: string[] = PublishUtilities.findMissingChangedPackages(fileFullPath, changedPackages);
    if (missingPackages.length > 0) {
      throw new Error(`Change file does not contain ${missingPackages.join(',')}.`);
    }
  }

  private _getChangeFiles(): string[] {
    return VersionControl.getChangedFiles(`common/changes/`,
      this._targetBranch.value);
  }

  private _hasProjectChanged(changedFolders: string[],
    project: RushConfigurationProject): boolean {
    let normalizedFolder: string = project.projectRelativeFolder;
    if (normalizedFolder.charAt(normalizedFolder.length - 1) !== '/') {
      normalizedFolder = normalizedFolder + '/';
    }
    const pathRegex: RegExp = new RegExp(`^${normalizedFolder}`, 'i');
    for (const folder of changedFolders) {
      if (folder && folder.match(pathRegex)) {
        return true;
      }
    }
  }

  /**
   * The main loop which continually asks user for questions about changes until they don't
   * have any more, at which point we collect their email and write the change file.
   */
  private _promptLoop(): Promise<void> {

    // If there are still projects, ask about the next one
    if (this._sortedProjectList.length) {
      return this._askQuestions(this._sortedProjectList.pop())
        .then((answers: IChangeInfo) => {

          // Save the info into the changefile
          this._changeFileData.changes.push(answers);

          // Continue to loop
          return this._promptLoop();

        });
    } else {
      // We are done, collect their e-mail
      return this._detectOrAskForEmail().then((email: string) => {
        this._changeFileData.email = email;
        return this._writeChangeFile();
      });
    }
  }

  /**
   * Asks all questions which are needed to generate changelist for a project.
   */
  private _askQuestions(packageName: string): Promise<IChangeInfo> {
    console.log(`${os.EOL}${packageName}`);

    return this._prompt({
        name: 'comment',
        type: 'input',
        message: `Describe changes, or ENTER if no changes:`
      })
      .then(({ comment }: { comment: string }) => {
        if (comment) {
          return this._prompt({
            choices: Object.keys(BUMP_OPTIONS).map(option => {
              return {
                'value': option,
                'name': BUMP_OPTIONS[option]
              };
            }),
            default: 'patch',
            message: 'Select the type of change:',
            name: 'bumpType',
            type: 'list'
          }).then(({ bumpType }: { bumpType: string }) => {
            return {
              packageName: packageName,
              comment: comment,
              type: bumpType
            } as IChangeInfo;
          });
        } else {
          return {
            comment: '',
            packageName: packageName,
            type: 'none'
          } as IChangeInfo;
        }
      });
  }

  /**
   * Will determine a user's email by first detecting it from their git config,
   * or will ask for it if it is not found or the git config is wrong.
   */
  private _detectOrAskForEmail(): Promise<string> {
    return this._detectAndConfirmEmail().then((email: string) => {

      if (email) {
        return Promise.resolve(email);
      } else {
        return this._promptForEmail();
      }

    });
  }

  /**
   * Detects the user's email address from their git configuration, prompts the user to approve the
   * detected email. It returns undefined if it cannot be detected.
   */
  private _detectAndConfirmEmail(): Promise<string> {
    let email: string;
    try {
      email = child_process.execSync('git config user.email')
        .toString()
        .replace(/(\r\n|\n|\r)/gm, '');
    } catch (err) {
      console.log('There was an issue detecting your git email...');
      email = undefined;
    }

    if (email) {
      return this._prompt([
        {
          type: 'confirm',
          name: 'isCorrectEmail',
          default: 'Y',
          message: `Is your email address ${email} ?`
        }
      ]).then(({ isCorrectEmail }: { isCorrectEmail: boolean }) => {
        return isCorrectEmail ? email : undefined;
      });
    } else {
      return Promise.resolve(undefined);
    }
  }

  /**
   * Asks the user for their e-mail address
   */
  private _promptForEmail(): Promise<string> {
    return this._prompt([
      {
        type: 'input',
        name: 'email',
        message: 'What is your email address?',
        validate: (input: string) => {
          return true; // @todo should be an email
        }
      }
    ])
    .then((answers) => {
      return answers.email;
    });
  }

  /**
   * Writes changefile to the common/changes folder. Will prompt for overwrite if file already exists.
   */
  private _writeChangeFile(): Promise<void> {
    const output: string = JSON.stringify(this._changeFileData, undefined, 2);

    let branch: string = undefined;
    try {
      branch = gitInfo().branch;
    } catch (error) {
      console.log('Could not automatically detect git branch name, using timestamps instead.');
    }

    const filename: string = (branch ?
      this._escapeFilename(`${branch}_${this._getTimestamp()}.json`) :
      `${this._getTimestamp()}.json`);

    const filepath: string = path.join(this._rushConfiguration.commonFolder, 'changes', filename);

    if (fsx.existsSync(filepath)) {
      // prompt about overwrite
      this._prompt([
        {
          name: 'overwrite',
          type: 'confirm',
          message: `Overwrite ${filepath} ?`
        }
      ]).then(({ overwrite }: { overwrite: string }) => {
        if (overwrite) {
          return this._writeFile(filepath, output);
        } else {
          console.log(`Not overwriting ${filepath}...`);
          return Promise.resolve(undefined);
        }
      });
    } else {
      return this._writeFile(filepath, output);
    }
  }

  /**
   * Writes a file to disk, ensuring the directory structure up to that point exists
   */
  private _writeFile(fileName: string, output: string): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (err: Error) => void) => {
      // We need mkdirp because writeFile will error if the dir doesn't exist
      // tslint:disable-next-line:no-any
      mkdirp(path.dirname(fileName), (err: any) => {
        if (err) {
          reject(err);
        }
        fsx.writeFile(fileName, output, (error: NodeJS.ErrnoException) => {
          if (error) {
            reject(error);
          } else {
            console.log('Created file: ' + fileName);
            resolve();
          }
        });
      });
    });
  }

  /**
  * Gets the current time, formatted as YYYY-MM-DD-HH-MM
  * Optionally will include seconds
  */
  private _getTimestamp(useSeconds: boolean = false): string {
    // Create a date string with the current time

    // dateString === "2016-10-19T22:47:49.606Z"
    const dateString: string = new Date().toJSON();

    // Parse out 2 capture groups, the date and the time
    const dateParseRegex: RegExp = /([0-9]{4}-[0-9]{2}-[0-9]{2}).*([0-9]{2}:[0-9]{2}:[0-9]{2})/;

    // matches[1] === "2016-10-19"
    // matches[2] === "22:47:49"
    const matches: RegExpMatchArray = dateString.match(dateParseRegex);

    // formattedDate === "2016-10-19"
    const formattedDate: string = matches[1];

    let formattedTime: string;
    if (useSeconds) {
      // formattedTime === "22-47-49"
      formattedTime = matches[2].replace(':', '-');
    } else {
      // formattedTime === "22-47"
      const timeparts: string[] = matches[2].split(':');
      formattedTime = `${timeparts[0]}-${timeparts[1]}`;
    }

    return `${formattedDate}-${formattedTime}`;
  }

  private _escapeFilename(filename: string, replacer: string = '-'): string {
    // Removes / ? < > \ : * | ", really anything that isn't a letter, number, '.' '_' or '-'
    const badCharacters: RegExp = /[^a-zA-Z0-9._-]/g;
    return filename.replace(badCharacters, replacer);
  }
}
