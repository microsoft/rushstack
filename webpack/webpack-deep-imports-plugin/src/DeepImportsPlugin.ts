// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { DllPlugin, type Compiler, WebpackError, type Chunk, type NormalModule } from 'webpack';

import { Async, FileSystem, LegacyAdapters, Path } from '@rushstack/node-core-library';

const PLUGIN_NAME: 'DeepImportsPlugin' = 'DeepImportsPlugin';

type DllPluginOptions = DllPlugin['options'];

/**
 * @public
 */
export interface IDeepImportsPluginOptions extends DllPluginOptions {
  /**
   * The folder name under the webpack context containing the constituent files included in the
   * entry's runtime chunk that will be output to the {@link IDeepImportsPluginOptions.outFolderName}
   * folder.
   */
  inFolderName: string;

  /**
   * The folder name under the webpack context where the commonJS files that point to the
   * generated bundle will be written.
   */
  outFolderName: string;

  /**
   * Do not create files under {@link IDeepImportsPluginOptions.outFolderName}
   * for modules with paths listed in this array.
   */
  pathsToIgnore?: string[];

  /**
   * If defined, copy .d.ts files for the .js files contained in the entry's runtime chunk from this folder
   * under the webpack context.
   */
  dTsFilesInputFolderName?: string;
}

const JS_EXTENSION: string = '.js';
const DTS_EXTENSION: string = '.d.ts';

/**
 * Returns the number of `/` characters present in a given string.
 */
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
export class DeepImportsPlugin extends DllPlugin {
  private readonly _inFolderName: string;
  private readonly _outFolderName: string;
  private readonly _pathsToIgnoreWithoutExtensions: Set<string>;
  private readonly _dTsFilesInputFolderName: string | undefined;

  public constructor(options: IDeepImportsPluginOptions) {
    const superOptions: DllPluginOptions = {
      ...options
    };
    delete (superOptions as Partial<IDeepImportsPluginOptions>).inFolderName;
    delete (superOptions as Partial<IDeepImportsPluginOptions>).outFolderName;
    delete (superOptions as Partial<IDeepImportsPluginOptions>).dTsFilesInputFolderName;
    delete (superOptions as Partial<IDeepImportsPluginOptions>).pathsToIgnore;
    super(superOptions);

    const inFolderName: string = options.inFolderName;
    if (!inFolderName) {
      throw new Error(`The "inFolderName" option was not specified.`);
    }

    if (path.isAbsolute(inFolderName)) {
      throw new Error(`The "inFolderName" option must not be absolute.`);
    }

    const outFolderName: string = options.outFolderName;
    if (!outFolderName) {
      throw new Error(`The "outFolderName" option was not specified.`);
    }

    if (path.isAbsolute(outFolderName)) {
      throw new Error(`The "outFolderName" option must not be absolute.`);
    }

    const dTsFilesInputFolderName: string | undefined = options.dTsFilesInputFolderName;
    if (dTsFilesInputFolderName && path.isAbsolute(dTsFilesInputFolderName)) {
      throw new Error(`The "dTsFilesInputFolderName" option must not be absolute.`);
    }

    const pathsToIgnoreWithoutExtensions: Set<string> = new Set();
    for (const pathToIgnore of options.pathsToIgnore || []) {
      let normalizedPathToIgnore: string = Path.convertToSlashes(pathToIgnore);
      if (normalizedPathToIgnore.endsWith(JS_EXTENSION)) {
        normalizedPathToIgnore = normalizedPathToIgnore.slice(0, -JS_EXTENSION.length);
      }

      pathsToIgnoreWithoutExtensions.add(normalizedPathToIgnore);
    }

    this._inFolderName = options.inFolderName;
    this._outFolderName = options.outFolderName;
    this._pathsToIgnoreWithoutExtensions = pathsToIgnoreWithoutExtensions;
    this._dTsFilesInputFolderName = dTsFilesInputFolderName;
  }

  public apply(compiler: Compiler): void {
    super.apply(compiler);

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(PLUGIN_NAME, async () => {
        const runtimeChunks: Chunk[] = [];
        for (const chunk of compilation.chunks) {
          if (chunk.hasRuntime()) {
            runtimeChunks.push(chunk);
          }
        }

        const { inputFileSystem } = compiler;
        if (!inputFileSystem) {
          compilation.errors.push(new WebpackError(`compiler.inputFileSystem is not defined`));
          return;
        }

        const outputPath: string | undefined = compilation.options.output.path;
        if (!outputPath) {
          compilation.errors.push(new WebpackError(`The "output.path" option was not specified.`));
          return;
        }

        interface ILibModuleDescriptor {
          libPathWithoutExtension: string;
          moduleId: string | number | null;
          secondaryChunkId: string | undefined;
        }

        const pathsToIgnoreWithoutExtension: Set<string> = this._pathsToIgnoreWithoutExtensions;
        const resolvedLibInFolder: string = path.join(compiler.context, this._inFolderName);
        const libModulesByChunk: Map<Chunk, ILibModuleDescriptor[]> = new Map();
        const encounteredLibPaths: Set<string> = new Set();
        for (const runtimeChunk of runtimeChunks) {
          const libModules: ILibModuleDescriptor[] = [];
          function processChunks(chunk: Chunk, secondaryChunkId: string | undefined): void {
            for (const runtimeChunkModule of compilation.chunkGraph.getChunkModules(chunk)) {
              if (runtimeChunkModule.type === 'javascript/auto') {
                const modulePath: string | undefined = (runtimeChunkModule as NormalModule)?.resource;
                if (modulePath?.startsWith(resolvedLibInFolder) && modulePath.endsWith(JS_EXTENSION)) {
                  const modulePathWithoutExtension: string = modulePath.slice(0, -JS_EXTENSION.length); // Remove the .js extension
                  const relativePathWithoutExtension: string = Path.convertToSlashes(
                    path.relative(resolvedLibInFolder, modulePathWithoutExtension)
                  );

                  if (!pathsToIgnoreWithoutExtension.has(relativePathWithoutExtension)) {
                    if (!encounteredLibPaths.has(relativePathWithoutExtension)) {
                      libModules.push({
                        libPathWithoutExtension: relativePathWithoutExtension,
                        moduleId: compilation.chunkGraph.getModuleId(runtimeChunkModule),
                        secondaryChunkId
                      });

                      encounteredLibPaths.add(relativePathWithoutExtension);
                    }
                  }
                }
              }
            }
          }

          for (const initialChunk of runtimeChunk.getAllInitialChunks()) {
            processChunks(initialChunk, undefined);
          }

          for (const secondaryChunk of runtimeChunk.getAllAsyncChunks()) {
            if (secondaryChunk.id) {
              processChunks(secondaryChunk, String(secondaryChunk.id));
            }
          }

          libModulesByChunk.set(runtimeChunk, libModules);
        }

        const resolvedLibOutFolder: string = path.join(compiler.context, this._outFolderName);
        const outputPathRelativeLibOutFolder: string = Path.convertToSlashes(
          path.relative(outputPath, resolvedLibOutFolder)
        );

        const resolvedDtsFilesInputFolderName: string | undefined = this._dTsFilesInputFolderName
          ? path.join(compiler.context, this._dTsFilesInputFolderName)
          : undefined;

        for (const [chunk, libModules] of libModulesByChunk) {
          const bundleFilenames: string[] = Array.from(chunk.files);
          let bundleJsFileBaseName: string | undefined;
          for (const filename of bundleFilenames) {
            if (filename.endsWith(JS_EXTENSION)) {
              if (bundleJsFileBaseName) {
                compilation.errors.push(
                  new WebpackError(`Multiple JS files were found for the ${chunk.name} chunk.`)
                );
                return undefined;
              } else {
                bundleJsFileBaseName = filename.slice(0, -JS_EXTENSION.length);
              }
            }
          }

          if (!bundleJsFileBaseName) {
            compilation.errors.push(
              new WebpackError(`The JS file for the ${chunk.name} chunk was not found.`)
            );
            return;
          }

          const jsFilePath: string = Path.convertToSlashes(path.join(outputPath!, bundleJsFileBaseName));
          const libOutFolderRelativeOutputPath: string = Path.convertToSlashes(
            path.relative(resolvedLibOutFolder, jsFilePath)
          );

          await Async.forEachAsync(
            libModules,
            async ({ libPathWithoutExtension, moduleId, secondaryChunkId }) => {
              const depth: number = countSlashes(libPathWithoutExtension);
              const requirePath: string = '../'.repeat(depth) + libOutFolderRelativeOutputPath;
              let moduleText: string;
              if (secondaryChunkId) {
                moduleText = [
                  `const runtimeChunkRequire = require(${JSON.stringify(requirePath)});`,
                  `// Ensure the chunk containing the module is loaded`,
                  `runtimeChunkRequire.f.require(${JSON.stringify(secondaryChunkId)});`,
                  `module.exports = runtimeChunkRequire(${JSON.stringify(moduleId)});`
                ].join('\n');
              } else {
                moduleText = [
                  `module.exports = require(${JSON.stringify(requirePath)})(${JSON.stringify(moduleId)});`
                ].join('\n');
              }

              compilation.emitAsset(
                `${outputPathRelativeLibOutFolder}/${libPathWithoutExtension}${JS_EXTENSION}`,
                new compiler.webpack.sources.RawSource(moduleText)
              );

              if (resolvedDtsFilesInputFolderName) {
                const dtsFilePath: string = path.join(
                  resolvedDtsFilesInputFolderName,
                  `${libPathWithoutExtension}${DTS_EXTENSION}`
                );
                let dtsFileContents: string | undefined;
                try {
                  dtsFileContents = (
                    await LegacyAdapters.convertCallbackToPromise(inputFileSystem.readFile, dtsFilePath)
                  )?.toString();
                } catch (e) {
                  if (!FileSystem.isNotExistError(e)) {
                    throw e;
                  }
                }

                if (dtsFileContents) {
                  compilation.emitAsset(
                    `${outputPathRelativeLibOutFolder}/${libPathWithoutExtension}${DTS_EXTENSION}`,
                    new compiler.webpack.sources.RawSource(dtsFileContents)
                  );

                  compilation.fileDependencies.add(dtsFilePath);
                }
              }
            },
            { concurrency: 10 }
          );
        }
      });
    });
  }
}
