// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import type { IRunScriptOptions } from '@rushstack/heft';

import { Async, AsyncQueue, FileSystem, type FolderItem, Import, Path } from '@rushstack/node-core-library';

const JS_FILE_EXTENSION: '.js' = '.js';

// Entry point invoked by "runScript" action from config/heft.json
export async function runAsync(options: IRunScriptOptions): Promise<void> {
  const {
    heftConfiguration: { buildFolderPath },
    heftTaskSession: {
      logger: { terminal }
    }
  } = options;

  const rushLibFolder: string = Import.resolvePackage({
    baseFolderPath: buildFolderPath,
    packageName: '@microsoft/rush-lib',
    useNodeJSResolver: true
  });

  const inFolderPath: string = `${rushLibFolder}/lib-esm`;
  const stubsTargetPath: string = `${buildFolderPath}/lib`;
  const libShimsIndexPath: string = `${buildFolderPath}/lib-shim/index`;

  terminal.writeLine(' Generating stub files under: ' + stubsTargetPath);

  const folderPathQueue: AsyncQueue<string | undefined> = new AsyncQueue([undefined]);
  await Async.forEachAsync(
    folderPathQueue,
    async ([relativeFolderPath, callback]) => {
      let folderPath: string;
      let targetFolderPath: string;
      if (relativeFolderPath) {
        folderPath = `${inFolderPath}/${relativeFolderPath}`;
        targetFolderPath = `${stubsTargetPath}/${relativeFolderPath}`;
      } else {
        folderPath = inFolderPath;
        targetFolderPath = stubsTargetPath;
      }

      const folderItems: FolderItem[] = await FileSystem.readFolderItemsAsync(folderPath);
      for (const folderItem of folderItems) {
        const itemName: string = folderItem.name;

        if (folderItem.isDirectory()) {
          const relativeItemPath: string = relativeFolderPath
            ? `${relativeFolderPath}/${itemName}`
            : itemName;
          folderPathQueue.push(relativeItemPath);
        } else if (folderItem.isFile() && itemName.endsWith(JS_FILE_EXTENSION)) {
          const fileBaseName: string = path.parse(itemName).name;
          const srcImportPath: string = relativeFolderPath
            ? `${relativeFolderPath}/${fileBaseName}`
            : fileBaseName;
          const shimImportPath: string = path.relative(folderPath, libShimsIndexPath);

          const shimPathLiteral: string = JSON.stringify(Path.convertToSlashes(shimImportPath));
          const srcImportPathLiteral: string = JSON.stringify(srcImportPath);

          FileSystem.writeFile(
            `${targetFolderPath}/${itemName}`,
            // Example:
            // module.exports = require("../../../lib-shim/index")._rushSdk_loadInternalModule("logic/policy/GitEmailPolicy");
            `module.exports = require(${shimPathLiteral})._rushSdk_loadInternalModule(${srcImportPathLiteral});`
          );
        }
      }
      callback();
    },
    { concurrency: 10 }
  );

  terminal.writeLine('Completed successfully.');
}
