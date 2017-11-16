// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

import RushCommandLineParser from './RushCommandLineParser';
import LinkManager from '../utilities/LinkManager';
import { BaseRushAction } from './BaseRushAction';

export default class LinkAction extends BaseRushAction {
  private _parser: RushCommandLineParser;
  private _force: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'link',
      summary: 'Create node_modules symlinks for all projects',
      documentation: 'Create node_modules symlinks for all projects'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._force = this.defineFlagParameter({
      parameterLongName: '--force',
      parameterShortName: '-f',
      description: 'Deletes and recreates all links, even if the filesystem state seems to indicate that this is ' +
        'unnecessary.'
    });
  }

  protected run(): void {
    const linkManager: LinkManager = LinkManager.getLinkManager(this.rushConfiguration);
    this._parser.catchSyncErrors(linkManager.createSymlinksForProjects(this._force.value));
  }
}
