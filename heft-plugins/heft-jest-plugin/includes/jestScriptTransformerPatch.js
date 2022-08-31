// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

const path = require('path');
const fs = require('fs');

// This patch is to disable cache reads/writes in Jest. Cache reads/writes add overhead I/O to running Jest
// with the heft-jest-plugin, since cache files for the heft typescript jest transformer simply read a file
// from disk and feed it to Jest. In addition, cache interaction has lead to some issues with Jest in the
// past, such as a race condition when attempting to rename the target cache file (see:
// https://github.com/facebook/jest/issues/4444). Passing '--no-cache' to Jest simply tells Jest to not read
// the produced cache files, but does nothing to prevent writing of these files. This patch disables both
// reading and writing of cache files.

const patchName = path.basename(__filename);
const HEFT_JEST_DISABLE_CACHE_ENV_VARIABLE = 'HEFT_JEST_DISABLE_CACHE';

function applyPatch() {
  try {
    let contextFolder = __dirname;
    // Resolve the "@jest/core" package relative to heft-jest-plugin
    contextFolder = path.dirname(require.resolve('@jest/core/package.json', { paths: [contextFolder] }));
    // Resolve the "@jest/transform" package relative to the @jest/core package
    contextFolder = path.dirname(require.resolve('@jest/transform/package.json', { paths: [contextFolder] }));
    // Resolve the ScriptTransformer module in the @jest/transform package
    const scriptTransformerFilePath = require.resolve('./build/ScriptTransformer', {
      paths: [contextFolder]
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
  let scriptContent = fs.readFileSync(scriptPath, { encoding: 'utf8' });
  const functionsToReplace = ['readCacheFile', 'writeCacheFile'];

  for (const functionName of functionsToReplace) {
    const originalFunctionName = `${functionName}Original`;

    // First, attempt to remove the existing patch, if one is present
    let match = scriptContent.match(new RegExp(`^\\s*const ${originalFunctionName} =`, 'm'));
    let originalFunctionContent;
    if (match) {
      const startIndex = match.index;
      const endIndex = scriptContent.indexOf('};', startIndex) + 2;
      originalFunctionContent = scriptContent.slice(startIndex, endIndex);
      scriptContent = scriptContent.slice(0, startIndex) + scriptContent.slice(endIndex);
    }

    // Then, attempt to find the function to patch
    match = scriptContent.match(new RegExp(`^\\s*const ${functionName} =`, 'm'));
    if (!match) {
      throw new Error(
        `The ${JSON.stringify(functionName)} function was not found in the file ${JSON.stringify(scriptPath)}`
      );
    }

    const startIndex = match.index;
    const endIndex = scriptContent.indexOf('};', startIndex) + 2;

    // If we already have the original function content, no need to extract it again
    if (originalFunctionContent === undefined) {
      originalFunctionContent = scriptContent
        .slice(startIndex, endIndex)
        .replace(`const ${functionName} =`, `const ${originalFunctionName} =`);
    }

    scriptContent =
      scriptContent.slice(0, startIndex) +
      `${originalFunctionContent}\n` +
      `const ${functionName} = (...args) => {\n` +
      `  if (process.env['${HEFT_JEST_DISABLE_CACHE_ENV_VARIABLE}']) {\n` +
      `    return;\n` +
      `  }\n` +
      `  return ${originalFunctionName}(...args);\n` +
      '};' +
      scriptContent.slice(endIndex);
  }

  // Delete instead of modifying the file. We want to break any hardlinks/symlinks
  // used by the package manager to link to the original file
  fs.unlinkSync(scriptPath);
  fs.writeFileSync(scriptPath, scriptContent);
}

if (typeof jest !== 'undefined' || process.env.JEST_WORKER_ID) {
  // This patch is incompatible with Jest's proprietary require() implementation
  console.log(`\nJEST ENVIRONMENT DETECTED - Skipping Heft's ${patchName}\n`);
} else {
  applyPatch();
}
