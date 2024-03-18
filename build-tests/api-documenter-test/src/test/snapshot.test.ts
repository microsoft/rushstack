// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import {
  Async,
  Executable,
  FileSystem,
  type FolderItem,
  Import,
  PackageJsonLookup
} from '@rushstack/node-core-library';
import process from 'process';

const PROJECT_FOLDER: string | undefined = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
const API_DOCUMENTER_PATH: string = require.resolve('@microsoft/api-documenter/lib/start');

interface IFolderItem {
  absolutePath: string;
  relativePath: string;
}
async function* readFolderItemsAsync(
  folderAbsolutePath: string,
  folderRelativePat: string
): AsyncIterable<IFolderItem> {
  const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(folderAbsolutePath);
  for (const folderItem of folderItems) {
    const itemAbsolutePath: string = `${folderAbsolutePath}/${folderItem.name}`;
    const itemRelativePath: string = `${folderRelativePat}/${folderItem.name}`;
    if (folderItem.isFile()) {
      yield { absolutePath: itemAbsolutePath, relativePath: itemRelativePath };
    } else {
      yield* readFolderItemsAsync(itemAbsolutePath, itemRelativePath);
    }
  }
}

async function runApiDocumenterAsync(verb: string, outputFolderName: string): Promise<void> {
  if (!PROJECT_FOLDER) {
    throw new Error('Cannot find package.json');
  }

  const outputPath: string = `${PROJECT_FOLDER}/temp/${outputFolderName}`;

  const apiDocumenterProcess = Executable.spawn(
    process.argv0,
    [API_DOCUMENTER_PATH, verb, '--input-folder', 'etc', '--output-folder', outputPath],
    {
      currentWorkingDirectory: PROJECT_FOLDER,
      stdio: 'pipe'
    }
  );

  const { exitCode } = await Executable.waitForExitAsync(apiDocumenterProcess);

  expect(exitCode).toBe(0);

  const itemContents: Map<string, string> = new Map();
  await Async.forEachAsync(
    readFolderItemsAsync(outputPath, ''),
    async ({ relativePath, absolutePath }) => {
      itemContents.set(relativePath, await FileSystem.readFileAsync(absolutePath));
    },
    { concurrency: 50 }
  );

  expect(itemContents).toMatchSnapshot('itemContents');
}

describe('api-documenter', () => {
  it('YAML', async () => {
    await runApiDocumenterAsync('generate', 'yaml');
  });

  it('markdown', async () => {
    await runApiDocumenterAsync('markdown', 'markdown');
  });
});
