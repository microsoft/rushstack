// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, AlreadyReportedError, Async, type FolderItem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';
import { RushConfiguration, type RushConfigurationProject } from '@microsoft/rush-lib';
import { CommandLineAction, type IRequiredCommandLineStringParameter } from '@rushstack/ts-command-line';

interface IFolderItemToCopy {
  absolutePath: string;
  relativePath: string;
  content: string;
}

async function* _getFolderItemsRecursiveAsync(
  folderAbsolutePath: string,
  folderRelativePath: string = ''
): AsyncIterable<IFolderItemToCopy> {
  let folderItems: FolderItem[];
  try {
    folderItems = await FileSystem.readFolderItemsAsync(folderAbsolutePath);
  } catch (e) {
    if (!FileSystem.isNotExistError(e)) {
      throw e;
    } else {
      return;
    }
  }

  for (const entry of folderItems) {
    const entryRelativePath: string = `${folderRelativePath}/${entry.name}`;
    const entryAbsolutePath: string = `${folderAbsolutePath}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* _getFolderItemsRecursiveAsync(entryAbsolutePath, entryRelativePath);
    } else {
      const content: string = await FileSystem.readFileAsync(entryAbsolutePath);
      yield {
        absolutePath: entryAbsolutePath,
        relativePath: entryRelativePath,
        content
      };
    }
  }
}

export class CollectProjectFilesAction extends CommandLineAction {
  private readonly _outputPathParameter: IRequiredCommandLineStringParameter;
  private readonly _subfolderParameter: IRequiredCommandLineStringParameter;

  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      actionName: 'collect-project-files',
      summary: 'Collects files from a subfolder of each project into a single output directory',
      documentation:
        'Iterates over all Rush projects, collects files from the specified subfolder,' +
        ' deduplicates by relative path and content, and writes them to the output directory.'
    });

    this._terminal = terminal;

    this._subfolderParameter = this.defineStringParameter({
      parameterLongName: '--subfolder',
      description: 'The subfolder within each project to collect files from (e.g. "temp/json-schemas").',
      argumentName: 'SUBFOLDER',
      required: true
    });

    this._outputPathParameter = this.defineStringParameter({
      parameterLongName: '--output-path',
      description: 'Path to the output directory for the collected files.',
      argumentName: 'PATH',
      required: true
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    const terminal: ITerminal = this._terminal;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation();

    const subfolder: string = this._subfolderParameter.value;
    const outputPath: string = path.resolve(this._outputPathParameter.value);

    const contentByAbsolutePathByRelativePath: Map<string, Map<string, string[]>> = new Map();

    await Async.forEachAsync(
      rushConfiguration.projects,
      async ({ projectFolder }: RushConfigurationProject) => {
        const files: AsyncIterable<IFolderItemToCopy> = _getFolderItemsRecursiveAsync(
          `${projectFolder}/${subfolder}`,
          ''
        );
        await Async.forEachAsync(
          files,
          async ({ absolutePath, relativePath, content }) => {
            let contentByAbsolutePath: Map<string, string[]> | undefined =
              contentByAbsolutePathByRelativePath.get(relativePath);
            if (!contentByAbsolutePath) {
              contentByAbsolutePath = new Map();
              contentByAbsolutePathByRelativePath.set(relativePath, contentByAbsolutePath);
            }

            let absolutePaths: string[] | undefined = contentByAbsolutePath.get(content);
            if (!absolutePaths) {
              absolutePaths = [];
              contentByAbsolutePath.set(content, absolutePaths);
            }

            absolutePaths.push(absolutePath);
          },
          { concurrency: 5 }
        );
      },
      { concurrency: 5 }
    );

    let encounteredCollisions: boolean = false;
    const filesToWrite: Map<string, string> = new Map();
    for (const [relativePath, contentByAbsolutePath] of contentByAbsolutePathByRelativePath) {
      if (contentByAbsolutePath.size > 1) {
        encounteredCollisions = true;

        terminal.writeErrorLine(
          `Multiple projects generated different contents for "${relativePath}" in "${subfolder}":`
        );

        for (const absolutePaths of contentByAbsolutePath.values()) {
          for (const absolutePath of absolutePaths) {
            terminal.writeErrorLine(`  - ${absolutePath}`);
          }
        }
      } else {
        filesToWrite.set(`${outputPath}/${relativePath}`, Array.from(contentByAbsolutePath.keys())[0]);
      }
    }

    if (encounteredCollisions) {
      throw new AlreadyReportedError();
    } else {
      await FileSystem.ensureEmptyFolderAsync(outputPath);

      await Async.forEachAsync(
        filesToWrite,
        async ([outPath, content]) =>
          await FileSystem.writeFileAsync(outPath, content, { ensureFolderExists: true }),
        { concurrency: 25 }
      );
    }
  }
}
