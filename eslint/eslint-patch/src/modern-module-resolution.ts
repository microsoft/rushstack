// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This is a workaround for https://github.com/eslint/eslint/issues/3458
//
// To correct how ESLint searches for plugin packages, add this line to the top of your project's .eslintrc.js file:
//
//    require("@rushstack/eslint-patch/modern-module-resolution");
//

import { EslintMajorVersion, ConfigArrayFactory, ModuleResolver } from './_patch-base';

if (!ConfigArrayFactory.__loadPluginPatched) {
  ConfigArrayFactory.__loadPluginPatched = true;
  const originalLoadPlugin = ConfigArrayFactory.prototype._loadPlugin;

  if (EslintMajorVersion === 6) {
    // ESLint 6.x
    ConfigArrayFactory.prototype._loadPlugin = function (
      name: string,
      importerPath: string,
      importerName: string
    ) {
      const originalResolve = ModuleResolver.resolve;
      try {
        ModuleResolver.resolve = function (moduleName: string, relativeToPath: string) {
          // resolve using importerPath instead of relativeToPath
          return originalResolve.call(this, moduleName, importerPath);
        };
        return originalLoadPlugin.apply(this, arguments);
      } finally {
        ModuleResolver.resolve = originalResolve;
      }
    };
  } else {
    // ESLint 7.x || 8.x
    ConfigArrayFactory.prototype._loadPlugin = function (name: string, ctx: Record<string, unknown>) {
      const originalResolve = ModuleResolver.resolve;
      try {
        ModuleResolver.resolve = function (moduleName: string, relativeToPath: string) {
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
