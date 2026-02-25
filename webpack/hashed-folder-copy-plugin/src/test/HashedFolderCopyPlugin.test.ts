// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('node:path', () => {
  const path: typeof import('path') = jest.requireActual('path');
  return path.posix;
});

jest.mock(
  'fast-glob/out/providers/provider',
  () => {
    const path: typeof import('path') = jest.requireActual('path');
    const { default: provider } = jest.requireActual('fast-glob/out/providers/provider');
    provider.prototype._getRootDirectory = function (task: { base: string }) {
      // fast-glob calls `path.resolve` which doesn't work correctly with the MemFS volume while running on Windows
      return path.posix.resolve(this._settings.cwd, task.base);
    };
    return { default: provider };
  },
  {}
);

import type { default as webpack, Stats, InputFileSystem, OutputFileSystem } from 'webpack';
import type { Volume } from 'memfs/lib/volume';
import type { FileSystem, FolderItem } from '@rushstack/node-core-library';

jest.setTimeout(1e9);

interface IFilePaths {
  itemRelativePath: string;
  itemAbsolutePath: string;
}

async function* enumerateFilesAsync(
  fileSystem: typeof FileSystem,
  absolutePath: string,
  relativePath: string
): AsyncIterable<IFilePaths> {
  const folderItems: FolderItem[] = await fileSystem.readFolderItemsAsync(absolutePath);
  for (const item of folderItems) {
    const name: string = item.name;
    const itemRelativePath: string = `${relativePath}/${name}`;
    const itemAbsolutePath: string = `${absolutePath}/${name}`;
    if (item.isDirectory()) {
      yield* enumerateFilesAsync(fileSystem, itemAbsolutePath, itemRelativePath);
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
  const { Async, FileSystem } = await import('@rushstack/node-core-library');

  const files: AsyncIterable<IFilePaths> = enumerateFilesAsync(FileSystem, absolutePath, relativePath);
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
  const [{ Volume }, { default: webpack }, { promisify }, { HashedFolderCopyPlugin }] = await Promise.all([
    import('memfs/lib/volume'),
    import('webpack'),
    import('node:util'),
    import('../HashedFolderCopyPlugin.ts')
  ]);

  const memoryFileSystem: Volume = new Volume();
  const folderContents: Record<string, string> = {};
  await readFolderAsync(inputFolderPath, '', folderContents);
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

  compiler.inputFileSystem = memoryFileSystem as unknown as InputFileSystem;
  compiler.outputFileSystem = memoryFileSystem as unknown as OutputFileSystem;

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

describe('HashedFolderCopyPlugin', () => {
  it('Handles the null case', async () => {
    await runTestAsync(`${__dirname}/scenarios/nullCase`);
  });

  it('Handles globbing a local folder', async () => {
    await runTestAsync(`${__dirname}/scenarios/localFolder`);
  });

  it('Handles globbing a package reference', async () => {
    await runTestAsync(`${__dirname}/scenarios/packageReference`);
  });
});
