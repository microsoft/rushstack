// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { promisify } from 'util';
import webpack, { type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';
import { Async, FileSystem, type FolderItem } from '@rushstack/node-core-library';

import { HashedFolderCopyPlugin } from '../HashedFolderCopyPlugin';

jest.setTimeout(1e9);

interface IFilePaths {
  itemRelativePath: string;
  itemAbsolutePath: string;
}

async function* enumerateFilesAsync(absolutePath: string, relativePath: string): AsyncIterable<IFilePaths> {
  const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(absolutePath);
  for (const item of folderItems) {
    const name: string = item.name;
    const itemRelativePath: string = `${relativePath}/${name}`;
    const itemAbsolutePath: string = `${absolutePath}/${name}`;
    if (item.isDirectory()) {
      yield* enumerateFilesAsync(itemAbsolutePath, itemRelativePath);
    } else if (item.isFile()) {
      yield { itemRelativePath, itemAbsolutePath };
    } else {
      throw new Error(`Unexpected item type`);
    }
  }
}

async function readFolderAsync(
  absolutePath: string,
  relativePath: string,
  outputObject: Record<string, string>
): Promise<void> {
  const files: AsyncIterable<IFilePaths> = enumerateFilesAsync(absolutePath, relativePath);
  await Async.forEachAsync(
    files,
    async ({ itemRelativePath, itemAbsolutePath }) => {
      const fileContents: string = await FileSystem.readFileAsync(itemAbsolutePath);
      outputObject[itemRelativePath] = fileContents;
    },
    { concurrency: 50 }
  );
}

async function runTestAsync(inputFolderPath: string): Promise<void> {
  const memoryFileSystem: Volume = new Volume();
  const folderContents: Record<string, string> = {};
  await readFolderAsync(inputFolderPath, '/', folderContents);
  memoryFileSystem.fromJSON(folderContents, '/src');

  const compiler: webpack.Compiler = webpack({
    entry: {
      main: '/entry.js'
    },
    output: {
      path: '/release',
      filename: '[name].js'
    },
    optimization: {
      minimizer: []
    },
    context: '/',
    mode: 'production',
    plugins: [new HashedFolderCopyPlugin()]
  });

  compiler.inputFileSystem = memoryFileSystem;
  compiler.outputFileSystem = memoryFileSystem;

  const stats: Stats | undefined = await promisify(compiler.run.bind(compiler))();
  await promisify(compiler.close.bind(compiler));
  if (!stats) {
    throw new Error(`Expected stats`);
  }
  const { errors, warnings } = stats.toJson('errors-warnings');
  expect(errors).toMatchSnapshot('Errors');
  expect(warnings).toMatchSnapshot('Warnings');

  const results: {} = memoryFileSystem.toJSON('/release');
  expect(results).toMatchSnapshot('Content');
}

describe(HashedFolderCopyPlugin.name, () => {
  it('Handles the null case', async () => {
    await runTestAsync(`${__dirname}/scenarios/nullCase`);
  });

  it('Handles globbing a local folder', async () => {
    await runTestAsync(`${__dirname}/scenarios/localFolder`);
  });
});
