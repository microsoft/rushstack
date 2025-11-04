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

export class CollectJsonSchemasAction extends CommandLineAction {
  private readonly _outputPathParameter: IRequiredCommandLineStringParameter;

  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      actionName: 'collect-json-schemas',
      summary: 'Generates JSON schema files based on rush.json inventory',
      documentation: "Use this to update the repo's JSON schema files"
    });

    this._terminal = terminal;

    this._outputPathParameter = this.defineStringParameter({
      parameterLongName: '--output-path',
      description: 'Path to the output directory for the generated JSON schema files.',
      argumentName: 'PATH',
      required: true
    });
  }

  protected override async onExecuteAsync(): Promise<void> {
    const terminal: ITerminal = this._terminal;
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation();

    const outputPath: string = path.resolve(this._outputPathParameter.value);

    const contentByAbsolutePathByRelativePath: Map<string, Map<string, string[]>> = new Map();

    await Async.forEachAsync(
      rushConfiguration.projects,
      async ({ projectFolder }: RushConfigurationProject) => {
        const schemaFiles: AsyncIterable<IFolderItemToCopy> = _getFolderItemsRecursiveAsync(
          `${projectFolder}/temp/json-schemas`,
          ''
        );
        await Async.forEachAsync(schemaFiles, async ({ absolutePath, relativePath, content }) => {
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
        });
      },
      { concurrency: 5 }
    );

    let encounteredCollisions: boolean = false;
    const filesToWrite: Map<string, string> = new Map();
    for (const [relativePath, contentByAbsolutePath] of contentByAbsolutePathByRelativePath) {
      if (contentByAbsolutePath.size > 1) {
        encounteredCollisions = true;

        terminal.writeErrorLine(
          `Multiple projects generated different contents for the JSON schema "${relativePath}":`
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
