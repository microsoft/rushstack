// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, type FolderItem, PackageJsonLookup } from '@rushstack/node-core-library';

async function* getFolderItemsAsync(
  absolutePath: string,
  relativePath: string
): AsyncGenerator<[string, string]> {
  const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(absolutePath);
  for (const item of folderItems) {
    const itemName: string = item.name;
    const itemAbsolutePath: string = `${absolutePath}/${itemName}`;
    const itemRelativePath: string = `${relativePath}/${itemName}`;
    if (item.isDirectory()) {
      yield* getFolderItemsAsync(itemAbsolutePath, itemRelativePath);
    } else {
      const itemContents: string = await FileSystem.readFileAsync(itemAbsolutePath);
      yield [itemRelativePath, itemContents];
    }
  }
}

describe('json-schema-typings-plugin', () => {
  it('should generate typings for JSON Schemas', async () => {
    const rootFolder: string | undefined = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
    if (!rootFolder) {
      throw new Error('Could not find root folder for the test');
    }

    const folderItemsArray: [string, string][] = [];
    for await (const item of getFolderItemsAsync(`${rootFolder}/temp/schema-dts`, '.')) {
      folderItemsArray.push(item);
    }

    folderItemsArray.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const folderItems: Record<string, string> = Object.fromEntries(folderItemsArray);
    expect(folderItems).toMatchSnapshot();
  });
});
