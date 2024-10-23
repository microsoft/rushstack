// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { Async, FileSystem, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { CommandLineAction, type CommandLineFlagParameter } from '@rushstack/ts-command-line';
import type { IExtractorMetadataJson, IProjectInfoJson } from '../../../../PackageExtractor';
import { makeBinLinksAsync } from '../../../../Utils';
import { getExtractorMetadataAsync, getTargetRootFolder } from '../../utilities/CreateLinksUtilities';
import {
  MAX_CONCURRENCY,
  REALIZE_FILES_PARAMETER_NAME,
  LINK_BINS_PARAMETER_NAME
} from '../../utilities/constants';
import { removeLinksAsync } from './RemoveAction';

async function createLinksAsync(
  terminal: ITerminal,
  targetRootFolder: string,
  extractorMetadataObject: IExtractorMetadataJson
): Promise<void> {
  await Async.forEachAsync(
    extractorMetadataObject.links,
    async (linkInfo) => {
      // Link to the relative path for symlinks
      const newLinkPath: string = `${targetRootFolder}/${linkInfo.linkPath}`;
      const linkTargetPath: string = `${targetRootFolder}/${linkInfo.targetPath}`;

      // Make sure the containing folder exists
      await FileSystem.ensureFolderAsync(path.dirname(newLinkPath));

      // NOTE: This logic is based on NpmLinkManager._createSymlink()
      if (linkInfo.kind === 'folderLink') {
        terminal.writeVerboseLine(`Creating linked folder at path "${newLinkPath}"`);
        await FileSystem.createSymbolicLinkJunctionAsync({ newLinkPath, linkTargetPath });
      } else if (linkInfo.kind === 'fileLink') {
        // Use hardlinks for Windows and symlinks for other platforms since creating a symbolic link
        // requires administrator permission on Windows. This may cause unexpected behaviour for consumers
        // of the hardlinked files. If this becomes an issue, we may need to revisit this.
        terminal.writeVerboseLine(`Creating linked file at path "${newLinkPath}"`);
        if (process.platform === 'win32') {
          await FileSystem.createHardLinkAsync({ newLinkPath, linkTargetPath });
        } else {
          await FileSystem.createSymbolicLinkFileAsync({ newLinkPath, linkTargetPath });
        }
      }
    },
    { concurrency: MAX_CONCURRENCY }
  );
}

async function realizeFilesAsync(
  terminal: ITerminal,
  targetRootFolder: string,
  extractorMetadataObject: IExtractorMetadataJson
): Promise<void> {
  await Async.forEachAsync(
    extractorMetadataObject.files,
    async (relativeFilePath) => {
      const filePath: string = `${targetRootFolder}/${relativeFilePath}`;
      const realFilePath: string = await FileSystem.getRealPathAsync(filePath);
      if (!Path.isEqual(realFilePath, filePath)) {
        await FileSystem.deleteFileAsync(filePath);

        // Hard links seem to cause build failures on Mac, so for all other operating
        // systems we copy files.
        terminal.writeVerboseLine(`Realizing file at path "${filePath}"`);
        if (process.platform === 'win32') {
          await FileSystem.createHardLinkAsync({ newLinkPath: filePath, linkTargetPath: realFilePath });
        } else {
          await FileSystem.copyFileAsync({ sourcePath: realFilePath, destinationPath: filePath });
        }
      }
    },
    { concurrency: MAX_CONCURRENCY }
  );
}

export class CreateAction extends CommandLineAction {
  private _terminal: ITerminal;
  private _realizeFilesParameter: CommandLineFlagParameter;
  private _linkBinsParameter: CommandLineFlagParameter;

  public constructor(terminal: ITerminal) {
    super({
      actionName: 'create',
      summary: 'Create symlinks for extraction',
      documentation: 'This action creates symlinks for the extraction process.'
    });

    this._terminal = terminal;

    this._realizeFilesParameter = this.defineFlagParameter({
      parameterLongName: REALIZE_FILES_PARAMETER_NAME,
      description: 'Realize files instead of creating symlinks'
    });

    this._linkBinsParameter = this.defineFlagParameter({
      parameterLongName: LINK_BINS_PARAMETER_NAME,
      description: 'Create the .bin files for extracted packages'
    });
  }

  protected async onExecute(): Promise<void> {
    const targetRootFolder: string = getTargetRootFolder();
    const extractorMetadataObject: IExtractorMetadataJson = await getExtractorMetadataAsync();
    const realizeFiles: boolean = this._realizeFilesParameter.value;
    const linkBins: boolean = this._linkBinsParameter.value;

    this._terminal.writeLine(`Creating links for extraction at path "${targetRootFolder}"`);
    await removeLinksAsync(this._terminal, targetRootFolder, extractorMetadataObject);
    await createLinksAsync(this._terminal, targetRootFolder, extractorMetadataObject);

    if (realizeFiles) {
      await realizeFilesAsync(this._terminal, targetRootFolder, extractorMetadataObject);
    }

    if (linkBins) {
      const extractedProjectFolderPaths: string[] = extractorMetadataObject.projects.map(
        (project: IProjectInfoJson) => path.resolve(targetRootFolder, project.path)
      );
      await makeBinLinksAsync(this._terminal, extractedProjectFolderPaths);
    }
  }
}
