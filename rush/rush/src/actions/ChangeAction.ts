/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

/// <reference path='../../typings/tsd.d.ts' />

import * as colors from 'colors';
import * as fs from 'fs';
import * as glob from 'glob';
import * as os from 'os';
import * as path from 'path';

const gitEmail: () => string = require('git-user-email');

const inquirer = require('inquirer'); /* Is this the right library? */

import { CommandLineAction } from '@microsoft/ts-command-line';

import {
  JsonFile,
  RushConfig,
  IRushLinkJson,
  RushConfigProject,
  Package,
  IResolveOrCreateResult,
  PackageDependencyKind,
  Utilities
} from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';

interface IPromptAnswers {
  projects: string[];
  bumpType: string;
  comments: string;
}

interface IChangeInfo {
  projects: string[];
  bumpType: 'major' | 'minor' | 'patch';
  comments: string;
  email: string;
}

export default class ChangeAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _prompt: any; // inquirer.PromptModule;
  private _projectList: string[];
  private _changes: IChangeInfo[];

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'change',
      summary: 'Record a change made to a package which will later require the package version number' +
        ' to be bumped',
      documentation: 'Asks a series of questions and then generates a <hash>.json file which is stored in ' +
        ' in the common folder. Later, run the `version-bump` command to actually perform the proper ' +
        ' version bumps. Note these changes will eventually be published in the packages\' changelog.md.'
        + os.EOL +
        ["Here's some help in figuring out what kind of change you are making: ",
        "",
        "MAJOR - these are breaking changes that are not backwards compatible. " +
        "Examples are: renaming a file/class, adding/removing a non-optional " +
        "parameter from a public API, or renaming an variable or function that " +
        "is exported.",
        "",
        "MINOR - these are changes that are backwards compatible (but not " +
        "forwards compatible). Examples are: adding a new public API or adding an " +
        "optional parameter to a public API",
        "",
        "PATCH - these are changes that are backwards and forwards compatible. " +
        "Examples are: Modifying a private API or fixing a bug in the logic " +
        "of how an existing API works.",
        ""].join(os.EOL)
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected onExecute(): void {
    // Code below adapted from web-build-tools
    this._projectList = RushConfig.loadFromDefaultLocation().projects
      .map(project => project.packageName).sort();
    this._prompt = inquirer.createPromptModule();
    this._changes = [];

    // We should consider making onExecute either be an async/await or have it return a promise
    this._promptLoop();
  }

  private _promptLoop(): Promise<{}> {
    const continuePrompt: any = [{
      name: 'addMore',
      type: 'confirm',
      message: 'Would you like to bump any additional projects?'
    }];

    return this._promptForBump()
      .then(this._prompt(continuePrompt))
      .then((answers: any) => {
        if (answers.addMore) {
          return this._promptLoop();
        } else {
          return this._writeChangeFile();
        }
      });
    };


  private _promptForBump(): Promise<void> {
    return this._askQuestions()
      .then((answers: IPromptAnswers) => {
      const projectInfo: IChangeInfo = {
        projects: answers.projects,
        bumpType: (answers.bumpType.substring(0, answers.bumpType.indexOf(" - ")) as 'major' | 'minor' | 'patch'),
        comments: answers.comments,
        email: undefined
      };

      this._changes.push(projectInfo);
    });
  }


  private _askQuestions(): Promise<IPromptAnswers> {
    // Questions related to the project. Had to split into two sets of questions in case user selects additional help
    const projectQuestions: any = [
      {
        name: 'projects',
        type: 'checkbox',
        message: 'Select the project(s) you would like to bump:',
        choices: this._projectList
      },
      {
        name: 'bumpType',
        type: 'list',
        message: 'Select the type of change:',
        default: 'patch',
        choices: [
          'major - for breaking changes (ex: renaming a file)',
          'minor - for adding new features (ex: exposing a new public API)',
          'patch - for fixes (ex: updating how an API works w/o touching its signature)',
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

  protected detectOrPromptForAlias(): Promise<string> {
    return this._detectEmail()
      .then((email: string) => {
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
  protected _detectEmail() {
    let email: string = gitEmail();
    if (email) {
      return this._prompt([
        {
          type: 'confirm',
          name: 'email',
          message: `Is your email address ${email} ?`,
        }
      ]).then((answers) => {
        if (answers.email) {
          return email;
        } else {
          return undefined;
        }
      })
    } else {
      Promise.resolve(undefined);
    }
  }

  /**
   * Asks the user for their e-mail address
   */
  protected _promptForEmail(): Promise<string> {
    return this._prompt([
      {
        type: 'input',
        name: 'email',
        message: 'What is your email address?',
        validate: (input: string) => {
          // @todo should be an email
        }
      }
    ])
    .then((answers) => {
      return answers.email;
    });
  }

  protected _writeChangeFile(): Promise<{}> {
    return new Promise<{}>((resolve: () => void, reject: (error?: any) => void) => {
      const output: string = JSON.stringify(this._changes, undefined, 2);

      const fileName = './changes/' + guid.create() + '.json';
      console.log('Create new changes file: ' + fileName);
      fs.writeFile(fileName, output, resolve);
    });
  }
}
