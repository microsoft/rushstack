// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@microsoft/ts-command-line';

import RushCommandLineParser from './RushCommandLineParser';
import { LinkManagerFactory } from '../logic/LinkManagerFactory';
import { BaseLinkManager } from '../logic/base/BaseLinkManager';
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

  protected run(): Promise<void> {
    const linkManager: BaseLinkManager = LinkManagerFactory.getLinkManager(this.rushConfiguration);
    return linkManager.createSymlinksForProjects(this._force.value);
  }
}
