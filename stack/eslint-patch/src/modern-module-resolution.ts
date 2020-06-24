// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This is a workaround for https://github.com/eslint/eslint/issues/3458
//
// To correct how ESLint searches for plugin packages, add this line to the top of your project's .eslintrc.js file:
//
//    require("@rushstack/eslint-patch/modern-module-resolution");
//
const path = require('path');
const fs = require('fs');

let currentModule = module;
while (!/[\\/]eslint[\\/]lib[\\/]cli-engine[\\/]config-array-factory\.js/i.test(currentModule.filename)) {
  if (!currentModule.parent) {
    // This was tested with ESLint 6.1.0; other versions may not work
    throw new Error('Failed to patch ESLint because the calling module was not recognized');
  }
  currentModule = currentModule.parent;
}
const eslintFolder = path.join(path.dirname(currentModule.filename), '../..');

// Detect the ESLint package version
const eslintPackageJson = fs.readFileSync(path.join(eslintFolder, 'package.json')).toString();
const eslintPackageObject = JSON.parse(eslintPackageJson);
const eslintPackageVersion = eslintPackageObject.version;
const versionMatch = /^([0-9]+)\./.exec(eslintPackageVersion); // parse the SemVer MAJOR part
if (!versionMatch) {
  throw new Error('Unable to parse ESLint version: ' + eslintPackageVersion);
}
const eslintMajorVersion = Number(versionMatch[1]);
if (!(eslintMajorVersion >= 6 && eslintMajorVersion <= 7)) {
  throw new Error(
    'The patch-eslint.js script has only been tested with ESLint version 6.x or 7.x. (Your version: ' +
      eslintPackageVersion +
      ')'
  );
}

const configArrayFactoryPath = path.join(eslintFolder, 'lib/cli-engine/config-array-factory');
const ConfigArrayFactory = require(configArrayFactoryPath).ConfigArrayFactory;

if (!ConfigArrayFactory.__patched) {
  ConfigArrayFactory.__patched = true;

  const moduleResolverPath = path.join(eslintFolder, 'lib/shared/relative-module-resolver');
  const ModuleResolver = require(moduleResolverPath);

  const originalLoadPlugin = ConfigArrayFactory.prototype._loadPlugin;

  if (eslintMajorVersion === 6) {
    // ESLint 6.x
    ConfigArrayFactory.prototype._loadPlugin = function (name, importerPath, importerName) {
      const originalResolve = ModuleResolver.resolve;
      try {
        ModuleResolver.resolve = function (moduleName, relativeToPath) {
          // resolve using importerPath instead of relativeToPath
          return originalResolve.call(this, moduleName, importerPath);
        };
        return originalLoadPlugin.apply(this, arguments);
      } finally {
        ModuleResolver.resolve = originalResolve;
      }
    };
  } else {
    // ESLint 7.x
    ConfigArrayFactory.prototype._loadPlugin = function (name, ctx) {
      const originalResolve = ModuleResolver.resolve;
      try {
        ModuleResolver.resolve = function (moduleName, relativeToPath) {
          // resolve using ctx.filePath instead of relativeToPath
          return originalResolve.call(this, moduleName, ctx.filePath);
        };
        return originalLoadPlugin.apply(this, arguments);
      } finally {
        ModuleResolver.resolve = originalResolve;
      }
    };
  }
}
