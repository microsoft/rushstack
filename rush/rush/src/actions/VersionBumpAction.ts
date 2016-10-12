/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

// @todo
// tslint:disable

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

export default class VersionBumpAction extends CommandLineAction {
  private _parser: RushCommandLineParser;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'version-bump',
      summary: 'Analyzes the changes folder and bumps package version numbers, and their dependencies appropriately',
      documentation: ''
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected onExecute(): void {
    const config = RushConfig.loadFromDefaultLocation();

    // Look at the changes

    // Collect changes on a per-project basis

    // For each project:
    //    Calculate the new version number
    //    Bump any dendency which now was an invalid #

    // Update the README files
  }
}
