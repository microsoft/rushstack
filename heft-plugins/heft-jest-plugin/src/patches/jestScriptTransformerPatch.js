// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const path = require('path');
const { Import, FileSystem } = require('@rushstack/node-core-library');

// This patch is to disable cache reads/writes in Jest. Cache reads/writes add overhead I/O to running Jest
// with the heft-jest-plugin, since cache files for the heft typescript jest transformer simply read a file
// from disk and feed it to Jest. In addition, cache interaction has lead to some issues with Jest in the
// past, such as a race condition when attempting to rename the target cache file (see:
// https://github.com/facebook/jest/issues/4444). Passing '--no-cache' to Jest simply tells Jest to not read
// the produced cache files, but does nothing to prevent writing of these files. This patch disables both
// reading and writing of cache files.

const patchName = path.basename(__filename);

function applyPatch() {
  try {
    let contextFolder = __dirname;
    // Resolve the "@jest/core" package relative to heft-jest-plugin
    contextFolder = Import.resolvePackage({ packageName: '@jest/core', baseFolderPath: contextFolder });
    // Resolve the ScriptTransformer module in the "@jest/transform" package relative to the @jest/core package
    const scriptTransformerFilePath = Import.resolveModule({
      modulePath: '@jest/transform/build/ScriptTransformer',
      baseFolderPath: contextFolder
    });

    // Patch the file contents
    patchScriptTransformer(scriptTransformerFilePath);
  } catch (e) {
    console.error();
    console.error(`ERROR: ${patchName} failed to patch the "@jest/transform" package:`);
    console.error(e.toString());
    console.error();

    throw e;
  }
}

function patchScriptTransformer(scriptPath) {
  // This patch is going to be very specific to the version of Jest that we are using.
  // This is intentional, because we want to make sure that we don't accidentally break
  // future versions of Jest that might have a different implementation.
  //
  // We will replace the existing implementation of the method to no-op.
  let scriptContent = FileSystem.readFile(scriptPath);
  const functionsToReplace = ['readCacheFile', 'writeCacheFile'];

  for (const functionName of functionsToReplace) {
    const match = scriptContent.match(new RegExp(`^\\s*const ${functionName} =`, 'm'));
    if (!match) {
      throw new Error(
        `The ${JSON.stringify(functionName)} function was not found in the file ${JSON.stringify(scriptPath)}`
      );
    }

    const startIndex = match.index;
    const endIndex = scriptContent.indexOf('};', startIndex) + 2;
    scriptContent =
      scriptContent.slice(0, startIndex) +
      `const ${functionName} = () => {};` +
      scriptContent.slice(endIndex);
  }

  FileSystem.deleteFile(scriptPath);
  FileSystem.writeFile(scriptPath, scriptContent);
}

if (typeof jest !== 'undefined' || process.env.JEST_WORKER_ID) {
  // This patch is incompatible with Jest's proprietary require() implementation
  console.log(`\nJEST ENVIRONMENT DETECTED - Skipping Heft's ${patchName}\n`);
} else {
  applyPatch();
}
