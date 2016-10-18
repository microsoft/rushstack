/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as child_process from 'child_process';
import gitInfo = require('git-repo-info');

import inquirer = require('inquirer');

import { CommandLineAction } from '@microsoft/ts-command-line';
import {
  RushConfig,
  IChangeFile,
  IChangeInfo
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';

const BUMP_OPTIONS: { [type: string]: string } = {
  'major': 'major - for breaking changes (ex: renaming a file)',
  'minor': 'minor - for adding new features (ex: exposing a new public API)',
  'patch': 'patch - for fixes (ex: updating how an API works w/o touching its signature)',
  'none': 'none - the change does not require a version bump (e.g. changing tests)'
};

export default class ChangeAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;
  private _sortedProjectList: string[];
  private _changeFileData: IChangeFile;

  private _prompt: inquirer.PromptModule;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'change',
      summary: 'Record a change made to a package which indicate how the package version number should be bumped.',
      documentation: ['Asks a series of questions and then generates a <branchname>.json file which is ' +
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
    // abstract
  }

  public onExecute(): void {
    this._rushConfig = RushConfig.loadFromDefaultLocation();
    this._sortedProjectList = this._rushConfig.projects
      .map(project => project.packageName)
      .sort();

    this._prompt = inquirer.createPromptModule();
    this._changeFileData = {
      changes: [],
      email: undefined
    };

    // We should consider making onExecute either be an async/await or have it return a promise
    this._promptLoop();
  }

  /**
   * The main loop which continually asks user for questions about changes until they don't
   * have any more, at which point we collect their email and write the change file.
   */
  private _promptLoop(): Promise<void> {

    return this._promptForBump()
      .then(this._shouldAddMoreProjects)
      .then((addMore: boolean) => {

        // Continue to loop
        if (addMore) {
          return this._promptLoop();
        } else {
          return this._detectOrAskForEmail().then((email: string) => {
            this._changeFileData.email = email;
            this._writeChangeFile();
          });
        }

      })
      .catch((error: Error) => {
        console.error('There was an issue creating the changefile:' + os.EOL + error.toString());
      });
  }

  private _shouldAddMoreProjects: () => Promise<boolean> = () => {
    const continuePrompt: inquirer.Questions = [{
      name: 'addMore',
      type: 'confirm',
      message: 'Would you like to bump any additional projects?'
    }];

    return this._prompt(continuePrompt).then(({ addMore }: { addMore: boolean }) => addMore);
  }

  /**
   * Ask the set of questions necessary for determining which changes were made
   */
  private _promptForBump(): Promise<void> {
    return this._askQuestions().then((answers: IChangeInfo) => {
      const projectInfo: IChangeInfo = {
        projects: answers.projects,
        bumpType: BUMP_OPTIONS[answers.bumpType] as 'major' | 'minor' | 'patch' | 'none',
        comments: answers.comments
      };

      this._changeFileData.changes.push(projectInfo);
    });
  }

  /**
   * Asks all questions which are needed to generate changelist for a project.
   */
  private _askQuestions(): Promise<IChangeInfo> {
    const projectQuestions: inquirer.Questions = [
      {
        name: 'projects',
        type: 'checkbox',
        message: 'Select the project(s) you would like to bump:',
        choices: this._sortedProjectList
      },
      {
        name: 'bumpType',
        type: 'list',
        message: 'Select the type of change:',
        default: 'patch',
        choices: Object.keys(BUMP_OPTIONS).map(option => BUMP_OPTIONS[option])
      },
      {
        name: 'comments',
        type: 'input',
        message: 'Useful comment which explains this change:'
      }
    ];

    return this._prompt(projectQuestions);
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
      console.log(email);
    } catch (err) {
      console.log('There was an issue detecting your git email...');
      email = undefined;
    }

    if (email) {
      return this._prompt([
        {
          type: 'confirm',
          name: 'isCorrectEmail',
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

    const branch: string = gitInfo().branch;
    const branchfile: string = path.join(this._rushConfig.commonFolder, 'changes', branch + '.json');

    if (fs.existsSync(branchfile)) {
      // prompt about overwrite
      this._prompt([
        {
          name: 'overwrite',
          type: 'confirm',
          message: `Overwrite ${branchfile} ?`
        }
      ]).then(({ overwrite }: { overwrite: string }) => {
        if (overwrite) {
          return this._writeFile(branchfile, output);
        } else {
          console.log(`Not overwriting ${branchfile}...`);
          return Promise.resolve(undefined);
        }
      });
    } else {
      return this._writeFile(branchfile, output);
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
        fs.writeFile(fileName, output, (error: NodeJS.ErrnoException) => {
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
}
