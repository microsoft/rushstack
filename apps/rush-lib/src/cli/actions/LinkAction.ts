// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { LinkManagerFactory } from '../../logic/LinkManagerFactory';
import { BaseRushAction } from './BaseRushAction';
import { BaseLinkManager } from '../../logic/base/BaseLinkManager';

export class LinkAction extends BaseRushAction {
  private _force: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'link',
      summary: 'Create node_modules symlinks for all projects',
      documentation:
        '(DEPRECATED) Create node_modules symlinks for all projects. This command is deprecated. To restore ' +
        'project node_modules folders, run "rush install" or "rush update".',
      parser
    });
  }

  protected onDefineParameters(): void {
    this._force = this.defineFlagParameter({
      parameterLongName: '--force',
      parameterShortName: '-f',
      description:
        'Deletes and recreates all links, even if the filesystem state seems to indicate that this is ' +
        'unnecessary.'
    });
  }

  protected async run(): Promise<void> {
    const linkManager: BaseLinkManager = LinkManagerFactory.getLinkManager(this.rushConfiguration);
    await linkManager.createSymlinksForProjects(this._force.value);
  }
}
