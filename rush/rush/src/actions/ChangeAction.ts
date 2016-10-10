/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';
import * as fs from 'fs';
import * as glob from 'glob';
import * as os from 'os';
import * as path from 'path';
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

export default class ChangeAction extends CommandLineAction {
  private _parser: RushCommandLineParser;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'change',
      summary: 'Record a change made to a package which will later require the package version number' +
        ' to be bumped',
      documentation: 'Asks a series of questions and then generates a <hash>.json file which is stored in ' +
        ' in the common folder. Later, run the `version-bump` command to actually perform the proper ' +
        ' version bumps. Note these changes will eventually be published in the packages\' changelog.md'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected onExecute(): void {
    const config = RushConfig.loadFromDefaultLocation();

    // Ask which projects have changed (or possibly detect)

    // Ask a question about the change

    // Collect alias

    // Ask which type of change

    // Drop file in ./changes folder
  }
}
