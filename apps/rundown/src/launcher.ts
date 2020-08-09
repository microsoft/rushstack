// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import moduleApi = require('module');
import * as process from 'process';
import * as fs from 'fs';

const SHOW_CALLER: boolean = false;

const importedModules: Set<unknown> = new Set();

// Map from required path --> caller path
const importedModuleMap: Map<string, string> = new Map();

function copyProperties(dst: object, src: object): void {
  for (var prop of Object.keys(src)) {
    dst[prop] = src[prop];
  }
}

function hookedRequire(moduleName: string): unknown {
  const importedModule: unknown = realRequire.apply(this, arguments);

  if (!importedModules.has(importedModule)) {
    importedModules.add(importedModule);

    const callingModuleInfo: NodeModule = this;

    // Find the info for the imported module
    let importedModuleInfo: NodeModule | undefined = undefined;
    const children = callingModuleInfo.children || [];
    for (const child of children) {
      if (child.exports === importedModule) {
        importedModuleInfo = child;
        break;
      }
    }

    if (importedModuleInfo === undefined) {
      // It's a built-in module like "os"
    } else {
      if (!importedModuleInfo.filename) {
        throw new Error('Missing filename for ' + moduleName);
      }

      if (!importedModuleMap.has(importedModuleInfo.filename)) {
        importedModuleMap.set(importedModuleInfo.filename, callingModuleInfo.filename);
      }
    }
  }

  return importedModule;
}

const realRequire = moduleApi.Module.prototype.require;

moduleApi.Module.prototype.require = hookedRequire;
copyProperties(hookedRequire, realRequire);

process.on('exit', () => {
  console.log('Writing trace-require.log');
  const importedPaths = [...importedModuleMap.keys()];
  importedPaths.sort();

  let data: string = '';

  if (SHOW_CALLER) {
    for (const importedPath of importedPaths) {
      data += importedPath + '\n';

      let current: string = importedPath;
      let visited: Set<string> = new Set();
      for (;;) {
        const callerPath = importedModuleMap.get(current);
        if (!callerPath) {
          break;
        }
        if (visited.has(callerPath)) {
          break;
        }
        visited.add(callerPath);
        data += '  ' + callerPath + '\n';
        current = callerPath;
      }
    }
  } else {
    data = importedPaths.join('\n') + '\n';
  }

  fs.writeFileSync('trace-require.log', data);
});
