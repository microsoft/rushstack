/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

/// <reference path='../../typings/tsd.d.ts' />

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as mkdirp from 'mkdirp';

const gitEmail: () => string = require('git-user-email');

// tslint:disable-next-line:no-any
const inquirer: any = require('inquirer'); /* @todo Is this the right library? */

import { CommandLineAction } from '@microsoft/ts-command-line';
import { RushConfig } from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';

interface IChangeFile {
  changes: IChangeInfo[];
  email: string;
}

interface IChangeInfo {
  projects: string[];
  bumpType: 'major' | 'minor' | 'patch';
  comments: string;
}

export default class ChangeAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _sortedProjectList: string[];
  private _data: IChangeFile;

  // @todo use correct typings
  // tslint:disable-next-line:no-any
  private _prompt: any; // inquirer.PromptModule;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'change',
      summary: 'Record a change made to a package which will later require the package version number' +
        ' to be bumped',
      documentation: 'Asks a series of questions and then generates a <hash>.json file which is stored in ' +
        ' in the common folder. Later, run the `version-bump` command to actually perform the proper ' +
        ' version bumps. Note these changes will eventually be published in the packages\' changelog.md.'
        + os.EOL +
        ['Here\'s some help in figuring out what kind of change you are making: ',
        '',
        'MAJOR - these are breaking changes that are not backwards compatible. ' +
        'Examples are: renaming a file/class, adding/removing a non-optional ' +
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
    // @todo - there is a problem accessing public readonly properties.. the typings appear to be wrong
    // tslint:disable-next-line:no-any
    this._sortedProjectList = (RushConfig.loadFromDefaultLocation() as any).projects
      .map(project => project.packageName).sort();
    this._prompt = inquirer.createPromptModule();
    this._data = {
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
    // @todo
    // tslint:disable-next-line:no-any
    const continuePrompt: any = [{
      name: 'addMore',
      type: 'confirm',
      message: 'Would you like to bump any additional projects?'
    }];

    return this._promptForBump()
      .then(() => { return this._prompt(continuePrompt); })
      .then((answers: { addMore: boolean }) => {

        if (answers.addMore) {
          return this._promptLoop();
        } else {
          return this._detectOrAskForEmail().then((email: string) => {
            this._data.email = email;
            this._writeChangeFile();
          });
        }
      })
      .catch((error: Error) => {
        console.error('There was an issue creating the changefile:' + os.EOL + error.toString());
      });
  }

  /**
   * Ask the set of questions necessary for determining which changes were made
   */
  private _promptForBump(): Promise<void> {
    return this._askQuestions().then((answers: IChangeInfo) => {
      const projectInfo: IChangeInfo = {
        projects: answers.projects,
        bumpType: (answers.bumpType.substring(0, answers.bumpType.indexOf(' - ')) as 'major' | 'minor' | 'patch'),
        comments: answers.comments
      };

      this._data.changes.push(projectInfo);
    });
  }

  /**
   * Asks all questions which are needed to generate changelist for a project.
   */
  private _askQuestions(): Promise<IChangeInfo> {
    // Questions related to the project. Had to split into two sets of questions in case user selects additional help

    // tslint:disable-next-line:no-any
    const projectQuestions: any = [
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
        choices: [
          'major - for breaking changes (ex: renaming a file)',
          'minor - for adding new features (ex: exposing a new public API)',
          'patch - for fixes (ex: updating how an API works w/o touching its signature)'
        ]
      },
      {
        name: 'comments',
        type: 'input',
        message: 'Please add any comments to help explain this change:'
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
    let email: string = gitEmail();
    if (email) {
      return this._prompt([
        {
          type: 'confirm',
          name: 'email',
          message: `Is your email address ${email} ?`
        }
      ]).then((answers) => {

        if (answers.email) {
          return email;
        } else {
          return undefined;
        }

      });
    } else {
      Promise.resolve(undefined);
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
   * Writes all queued changes to a file in the common folder that has a GUID filename
   */
  private _writeChangeFile(): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (error?: Error) => void) => {
      const output: string = JSON.stringify(this._data, undefined, 2);

      // @todo actually create a guid
      const fileName: string = 'c:\\changes\\foobar.json';
      console.log('Create new changes file: ' + fileName);

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
            resolve();
          }
        });
      });
    });
  }
}
