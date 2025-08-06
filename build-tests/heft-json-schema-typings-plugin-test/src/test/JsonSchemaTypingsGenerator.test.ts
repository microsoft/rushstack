// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, type FolderItem, PackageJsonLookup } from '@rushstack/node-core-library';

async function getFolderItemsAsync(
  absolutePath: string,
  relativePath: string
): Promise<Record<string, string>> {
  const folderQueue: [string, string][] = [[absolutePath, relativePath]];
  const results: [string, string][] = [];
  for (const [folderAbsolutePath, folderRelativePath] of folderQueue) {
    const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(folderAbsolutePath);
    for (const item of folderItems) {
      const itemName: string = item.name;
      const itemAbsolutePath: string = `${folderAbsolutePath}/${itemName}`;
      const itemRelativePath: string = `${folderRelativePath}/${itemName}`;
      if (item.isDirectory()) {
        folderQueue.push([itemAbsolutePath, itemRelativePath]);
      } else {
        const itemContents: string = await FileSystem.readFileAsync(itemAbsolutePath);
        results.push([itemRelativePath, itemContents]);
      }
    }
  }

  results.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(results);
}

describe('json-schema-typings-plugin', () => {
  it('should generate typings for JSON Schemas', async () => {
    const rootFolder: string | undefined = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname);
    if (!rootFolder) {
      throw new Error('Could not find root folder for the test');
    }

    const folderItems: Record<string, string> = await getFolderItemsAsync(
      `${rootFolder}/temp/schema-dts`,
      '.'
    );
    expect(folderItems).toMatchSnapshot();
  });
});
