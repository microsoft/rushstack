// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { Async, FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { CommandLineAction } from '@rushstack/ts-command-line';

import type { IExtractorMetadataJson } from '../../../../PackageExtractor.ts';
import { getExtractorMetadataAsync } from '../../utilities/CreateLinksUtilities.ts';
import { TARGET_ROOT_FOLDER, MAX_CONCURRENCY } from '../../utilities/constants.ts';

export async function removeLinksAsync(
  terminal: ITerminal,
  targetRootFolder: string,
  extractorMetadataObject: IExtractorMetadataJson
): Promise<void> {
  await Async.forEachAsync(
    extractorMetadataObject.links,
    async ({ linkPath }) => {
      const newLinkPath: string = path.join(targetRootFolder, linkPath);
      terminal.writeVerboseLine(`Removing link at path "${newLinkPath}"`);
      await FileSystem.deleteFileAsync(newLinkPath, { throwIfNotExists: false });
    },
    { concurrency: MAX_CONCURRENCY }
  );
}

export class RemoveLinksAction extends CommandLineAction {
  private _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      actionName: 'remove',
      summary: 'Remove symlinks created by the "create" action',
      documentation: 'This action removes the symlinks created by the "create" action.'
    });

    this._terminal = terminal;
  }

  protected override async onExecuteAsync(): Promise<void> {
    const extractorMetadataObject: IExtractorMetadataJson = await getExtractorMetadataAsync();

    this._terminal.writeLine(`Removing links for extraction at path "${TARGET_ROOT_FOLDER}"`);
    await removeLinksAsync(this._terminal, TARGET_ROOT_FOLDER, extractorMetadataObject);
  }
}
