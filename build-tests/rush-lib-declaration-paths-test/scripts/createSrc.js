'use strict';

const { FileSystem, Import } = require('@rushstack/node-core-library');

const DTS_EXTENSION = '.d.ts';

module.exports = {
  runAsync: async ({ heftConfiguration: { buildFolderPath } }) => {
    const rushLibPath = Import.resolvePackage({
      packageName: '@microsoft/rush-lib',
      baseFolderPath: __dirname
    });

    async function* collectDtsPaths(absoluteFolderPath, relativeFolderPath) {
      const folderItems = FileSystem.readFolderItems(absoluteFolderPath);
      for (const folderItem of folderItems) {
        const folderItemName = folderItem.name;
        if (folderItem.isDirectory()) {
          yield* collectDtsPaths(
            `${absoluteFolderPath}/${folderItemName}`,
            `${relativeFolderPath}/${folderItemName}`
          );
        } else if (folderItemName.endsWith(DTS_EXTENSION)) {
          yield `${relativeFolderPath}/${folderItemName.slice(0, -DTS_EXTENSION.length)}`;
        }
      }
    }

    const indexFileLines = [
      '// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.',
      '// See LICENSE in the project root for license information.',
      ''
    ];
    for await (const dtsPath of collectDtsPaths(`${rushLibPath}/lib-commonjs`, '@microsoft/rush-lib/lib')) {
      indexFileLines.push(`import '${dtsPath}';`);
    }

    const srcFolderPath = `${buildFolderPath}/src`;
    await FileSystem.writeFileAsync(`${srcFolderPath}/index.ts`, indexFileLines.join('\n'), {
      ensureFolderExists: true
    });
  }
};
