// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction, CommandLineFlagParameter } from '@microsoft/ts-command-line';
import { RushConfiguration } from '@microsoft/rush-lib';

import RushCommandLineParser from './RushCommandLineParser';
import LinkManager from '../utilities/LinkManager';

export default class LinkAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfiguration: RushConfiguration;
  private _force: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'link',
      summary: 'Create node_modules symlinks for all projects',
      documentation: 'Create node_modules symlinks for all projects'
    });
    this._parser = parser;
    this._rushConfiguration = parser.rushConfiguration;
  }

  protected onDefineParameters(): void {
    this._force = this.defineFlagParameter({
      parameterLongName: '--force',
      parameterShortName: '-f',
      description: 'Deletes and recreates all links, even if the filesystem state seems to indicate that this is ' +
        'unnecessary.'
    });
  }

  protected onExecute(): void {
    const linkManager: LinkManager = new LinkManager(this._rushConfiguration);
    this._parser.catchSyncErrors(linkManager.createSymlinksForProjects(this._force.value));
  }
}
