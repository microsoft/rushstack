// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { WebpackPluginInstance, Compiler, Configuration, Chunk } from 'webpack';
import VirtualModulesPlugin from 'webpack-virtual-modules';
import path from 'path';
import glob from 'fast-glob';
import { Path } from '@rushstack/node-core-library';

const PLUGIN_NAME: 'DeepImportsCompatPlugin' = 'DeepImportsCompatPlugin';

/**
 * @public
 */
export interface IDeepImportsCompatPluginOptions {
  inFolder: {
    folderName: string;
    // TODO: Support .npmignore/the package.json files property
    includePatterns: string[];
    excludePatterns?: string[];
  };
  outFolderName: string;
  bundleName: string;
  context?: string;
}

const HAS_BEEN_APPLIED_SYMBOL: unique symbol = Symbol(`${PLUGIN_NAME}.hasBeenApplied`);
const JS_EXTENSION: string = '.js';

interface IExtendedConfiguration extends Configuration {
  [HAS_BEEN_APPLIED_SYMBOL]?: true;
}

function countSlashes(str: string): number {
  let count: number = 0;
  for (
    let lastIndex: number = str.indexOf('/');
    lastIndex !== -1;
    lastIndex = str.indexOf('/', lastIndex + 1)
  ) {
    count++;
  }

  return count;
}

/**
 * Webpack plugin that creates a bundle and commonJS files in a 'lib' folder mirroring modules in another 'lib' folder.
 * @public
 */
export class DeepImportsCompatPlugin implements WebpackPluginInstance {
  private readonly _options: IDeepImportsCompatPluginOptions;
  private readonly _virtualModules: VirtualModulesPlugin;
  private readonly _moduleName: string;
  private readonly _resolvedInFolder: string;

  private constructor(
    options: IDeepImportsCompatPluginOptions,
    virtualModulesPlugin: VirtualModulesPlugin,
    resolvedInFolder: string,
    moduleName: string
  ) {
    this._options = options;
    this._virtualModules = virtualModulesPlugin;
    this._resolvedInFolder = resolvedInFolder;
    this._moduleName = moduleName;
  }

  public static applyToWebpackConfiguration(
    webpackConfiguration: Configuration,
    options: IDeepImportsCompatPluginOptions
  ): void {
    const extendedConfiguration: IExtendedConfiguration = webpackConfiguration as IExtendedConfiguration;
    if (extendedConfiguration[HAS_BEEN_APPLIED_SYMBOL]) {
      throw new Error(`The ${PLUGIN_NAME} has already been applied to this webpack configuration.`);
    }

    extendedConfiguration[HAS_BEEN_APPLIED_SYMBOL] = true;

    if (!webpackConfiguration.plugins) {
      webpackConfiguration.plugins = [];
    }

    for (const existingPlugin of webpackConfiguration.plugins) {
      if (existingPlugin instanceof DeepImportsCompatPlugin) {
        throw new Error(`The ${PLUGIN_NAME} has already been applied to this webpack configuration.`);
      } else if (existingPlugin instanceof VirtualModulesPlugin) {
        throw new Error(
          `The ${PLUGIN_NAME} cannot be applied because another plugin has already registered ` +
            `the VirtualModulesPlugin.`
        );
      }
    }

    const {
      inFolder: { folderName: inFolderName },
      outFolderName: outFolder,
      bundleName,
      context
    } = options;
    if (path.isAbsolute(inFolderName)) {
      throw new Error(`The "inFolder.folderNAme" option must not be absolute.`);
    }

    if (path.isAbsolute(outFolder)) {
      throw new Error(`The "outFolder" option must not be absolute.`);
    }

    const contextToUse: string | undefined = webpackConfiguration.context || context;
    if (!contextToUse) {
      throw new Error(
        `The "context" option must be provided, either on the webpack configuration or on the plugin options.`
      );
    }

    const resolvedInFolder: string = path.join(contextToUse, inFolderName);
    const moduleName: string = path.join(resolvedInFolder, `___${PLUGIN_NAME}__${bundleName}__`);

    const virtualModulesPlugin: VirtualModulesPlugin = new VirtualModulesPlugin();
    const plugin: DeepImportsCompatPlugin = new DeepImportsCompatPlugin(
      options,
      virtualModulesPlugin,
      resolvedInFolder,
      moduleName
    );

    webpackConfiguration.plugins.push(virtualModulesPlugin);
    webpackConfiguration.plugins.push(plugin);

    if (!webpackConfiguration.entry) {
      webpackConfiguration.entry = {};
    }

    if (typeof webpackConfiguration.entry === 'string') {
      throw new Error(`The "entry" option must not be a string.`);
    }

    if (Array.isArray(webpackConfiguration.entry)) {
      throw new Error(`The "entry" option must not be an array.`);
    }

    if (typeof webpackConfiguration.entry === 'function') {
      throw new Error(`The "entry" option must not be a function.`);
    }

    webpackConfiguration.entry[bundleName] = {
      import: moduleName,
      library: {
        type: 'commonjs'
      }
    };
  }

  public apply(compiler: Compiler): void {
    const {
      inFolder: { includePatterns: inFolderIncludePatterns, excludePatterns: inFolderExcludePatterns },
      bundleName,
      outFolderName
    } = this._options;
    const resolvedInFolder: string = this._resolvedInFolder;
    let libPaths: string[];
    compiler.hooks.beforeRun.tapPromise(PLUGIN_NAME, async () => {
      const [includePaths, excludePaths] = await Promise.all([
        glob(inFolderIncludePatterns, {
          cwd: resolvedInFolder,
          onlyFiles: true
        }),
        inFolderExcludePatterns
          ? glob(inFolderExcludePatterns, {
              cwd: resolvedInFolder,
              onlyFiles: true
            })
          : undefined
      ]);

      if (excludePaths) {
        const excludePathsSet: Set<string> = new Set(excludePaths);
        libPaths = [];
        for (const includePath of includePaths) {
          if (!excludePathsSet.has(includePath)) {
            libPaths.push(includePath);
          }
        }
      } else {
        libPaths = includePaths;
      }

      libPaths = libPaths.sort();

      const lines: string = [
        'export function getPath(p) {',
        '  switch(p) {',
        ...libPaths.map((path) => `  case '${path}': return require('./${path}');`),
        '  }',
        '}',
        ''
      ].join('\n');
      this._virtualModules.writeModule(this._moduleName, lines);
    });

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(PLUGIN_NAME, async () => {
        // `ChunkGroup` is not exported from 'webpack'
        // eslint-disable-next-line @typescript-eslint/typedef
        const chunkGroup /* ChunkGroup | undefined */ = compilation.namedChunkGroups.get(bundleName);
        if (!chunkGroup) {
          throw new Error(`The chunk group ${bundleName} was not found.`);
        }

        let runtimeChunk: Chunk | undefined;
        for (const chunk of chunkGroup.chunks) {
          if (chunk.hasRuntime()) {
            if (runtimeChunk) {
              throw new Error(`Multiple runtime chunks were found in the ${bundleName} chunk group.`);
            } else {
              runtimeChunk = chunk;
            }
          }
        }

        if (!runtimeChunk) {
          throw new Error(`The runtime chunk in the ${bundleName} chunk group not found.`);
        }

        const filenames: string[] = Array.from(runtimeChunk.files);
        let jsFileBaseName: string | undefined;
        for (const filename of filenames) {
          if (filename.endsWith(JS_EXTENSION)) {
            if (jsFileBaseName) {
              throw new Error(`Multiple JS files were found in the ${bundleName} chunk group.`);
            } else {
              jsFileBaseName = filename.substring(0, filename.length - JS_EXTENSION.length);
            }
          }
        }

        if (!jsFileBaseName) {
          throw new Error(`The JS file in the ${bundleName} chunk group not found.`);
        }

        const outputPath: string | undefined = compilation.options.output.path;
        if (!outputPath) {
          throw new Error(`The "output.path" option was not specified.`);
        }

        const jsFilePath: string = Path.convertToSlashes(path.join(outputPath, jsFileBaseName));
        const jsFileFolderPath: string = jsFilePath.substring(0, jsFilePath.lastIndexOf('/'));

        const resolvedLibOutFolder: string = path.join(compiler.context, outFolderName);
        const outputPathRelativeLibOutFolder: string = Path.convertToSlashes(
          path.relative(jsFileFolderPath, resolvedLibOutFolder)
        );
        const libOutFolderRelativeOutputPath: string = Path.convertToSlashes(
          path.relative(resolvedLibOutFolder, jsFilePath)
        );
        for (const libPath of libPaths) {
          const depth: number = countSlashes(libPath);
          const requirePath: string = '../'.repeat(depth) + libOutFolderRelativeOutputPath;
          const moduleText: string = [
            `module.exports = require('${requirePath}').getPath('${libPath}');`
          ].join('\n');

          compilation.emitAsset(
            `${outputPathRelativeLibOutFolder}/${libPath}`,
            new compiler.webpack.sources.RawSource(moduleText)
          );
        }
      });
    });
  }
}
