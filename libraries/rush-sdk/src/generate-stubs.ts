// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Encoding, FileSystem, Import, Path } from '@rushstack/node-core-library';

function generateLibFilesRecursively(options: {
  parentSourcePath: string;
  parentTargetPath: string;
  parentSrcImportPathWithSlash: string;
  libShimIndexPath: string;
}): void {
  for (const folderItem of FileSystem.readFolderItems(options.parentSourcePath)) {
    const sourcePath: string = path.join(options.parentSourcePath, folderItem.name);
    const targetPath: string = path.join(options.parentTargetPath, folderItem.name);
    const commonjsPath: string = path.join(options.parentSourcePath, folderItem.name);

    if (folderItem.isDirectory()) {
      // create destination folder
      FileSystem.ensureEmptyFolder(targetPath);
      generateLibFilesRecursively({
        parentSourcePath: sourcePath,
        parentTargetPath: targetPath,
        parentSrcImportPathWithSlash: options.parentSrcImportPathWithSlash + folderItem.name + '/',
        libShimIndexPath: options.libShimIndexPath
      });
    } else {
      if (folderItem.name.endsWith('.d.ts')) {
        FileSystem.copyFile({
          sourcePath: sourcePath,
          destinationPath: targetPath
        });
      } else if (folderItem.name.endsWith('.js')) {
        const srcImportPath: string = options.parentSrcImportPathWithSlash + path.parse(folderItem.name).name;
        const shimPath: string = path.relative(options.parentTargetPath, options.libShimIndexPath);
        const shimPathLiteral: string = JSON.stringify(Path.convertToSlashes(shimPath));
        const srcImportPathLiteral: string = JSON.stringify(srcImportPath);

        // Since the DeepImportsPlugin has already generated the named exports placeholder code, we reuse it here
        const rushLibCommonjsCode: string = FileSystem.readFile(commonjsPath);
        let namedExportsPlaceholder: string = rushLibCommonjsCode.match(/exports\..* = void 0;/)?.[0] || '';
        if (namedExportsPlaceholder) {
          namedExportsPlaceholder += '\n\n';
        }

        FileSystem.writeFile(
          targetPath,
          // Example:
          // module.exports = require("../../../lib-shim/index")._rushSdk_loadInternalModule("logic/policy/GitEmailPolicy");
          `${namedExportsPlaceholder}module.exports = require(${shimPathLiteral})._rushSdk_loadInternalModule(${srcImportPathLiteral});`
        );
      }
    }
  }
}

// Entry point invoked by "runScript" action from config/heft.json
export async function runAsync(): Promise<void> {
  const rushLibFolder: string = Import.resolvePackage({
    baseFolderPath: __dirname,
    packageName: '@microsoft/rush-lib',
    useNodeJSResolver: true
  });

  const stubsTargetPath: string = path.resolve(__dirname, '../lib');
  // eslint-disable-next-line no-console
  console.log('generate-stubs: Generating stub files under: ' + stubsTargetPath);
  generateLibFilesRecursively({
    parentSourcePath: path.join(rushLibFolder, 'lib'),
    parentTargetPath: stubsTargetPath,
    parentSrcImportPathWithSlash: '',
    libShimIndexPath: path.join(__dirname, '../lib-shim/index')
  });
  // eslint-disable-next-line no-console
  console.log('generate-stubs: Completed successfully.');
}
