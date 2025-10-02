// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash, type Hash } from 'node:crypto';

import {
  CachedSource,
  ConcatSource,
  RawSource,
  ReplaceSource,
  type Source,
  SourceMapSource
} from 'webpack-sources';
import * as webpack from 'webpack';
import { AsyncSeriesWaterfallHook, type SyncHook, SyncWaterfallHook, type TapOptions } from 'tapable';

import {
  CHUNK_MODULES_TOKEN,
  MODULE_WRAPPER_PREFIX,
  MODULE_WRAPPER_SUFFIX,
  STAGE_BEFORE,
  STAGE_AFTER
} from './Constants';
import type {
  IMinifierConnection,
  IModuleMinifier,
  IModuleMinificationResult,
  IModuleMinificationErrorResult
} from '@rushstack/module-minifier';
import { getIdentifier } from '@rushstack/module-minifier';

import type {
  IModuleMinifierPluginOptions,
  IModuleMap,
  IAssetMap,
  IExtendedModule,
  IModuleMinifierPluginHooks,
  IPostProcessFragmentContext,
  IDehydratedAssets,
  _IWebpackCompilationData,
  _IAcornComment,
  IModuleMinifierPluginStats,
  IAssetStats
} from './ModuleMinifierPlugin.types';
import { generateLicenseFileForAsset } from './GenerateLicenseFileForAsset';
import { rehydrateAsset } from './RehydrateAsset';
import { AsyncImportCompressionPlugin } from './AsyncImportCompressionPlugin';
import { PortableMinifierModuleIdsPlugin } from './PortableMinifierIdsPlugin';

import './OverrideWebpackIdentifierAllocation';

// The name of the plugin, for use in taps
const PLUGIN_NAME: 'ModuleMinifierPlugin' = 'ModuleMinifierPlugin';

// Monotonically increasing identifier to be incremented any time the code generation logic changes
// Will be applied to the webpack hash.
const CODE_GENERATION_REVISION: number = 1;

const TAP_BEFORE: TapOptions<'promise'> = {
  name: PLUGIN_NAME,
  stage: STAGE_BEFORE
};
const TAP_AFTER: TapOptions<'sync'> = {
  name: PLUGIN_NAME,
  stage: STAGE_AFTER
};

interface IExtendedChunkTemplate {
  hooks: {
    hashForChunk: SyncHook<Hash, webpack.compilation.Chunk>;
    modules: SyncWaterfallHook<Source, webpack.compilation.Chunk>;
  };
}

interface IExtendedParser extends webpack.compilation.normalModuleFactory.Parser {
  state: {
    module: IExtendedModule;
  };
}

interface IExtendedModuleTemplate extends webpack.compilation.ModuleTemplate {
  render: (module: IExtendedModule, dependencyTemplates: unknown, options: unknown) => Source;
}

interface IOptionsForHash extends Omit<IModuleMinifierPluginOptions, 'minifier'> {
  revision: number;
  minifier: undefined;
}

const compilationMetadataMap: WeakMap<webpack.compilation.Compilation, IModuleMinifierPluginStats> =
  new WeakMap();

/**
 * https://github.com/webpack/webpack/blob/30e747a55d9e796ae22f67445ae42c7a95a6aa48/lib/Template.js#L36-47
 * @param a first id to be sorted
 * @param b second id to be sorted against
 * @returns the sort value
 */
function stringifyIdSortPredicate(a: string | number, b: string | number): -1 | 0 | 1 {
  const aId: string = a + '';
  const bId: string = b + '';
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return 0;
}

function hashCodeFragment(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Base implementation of asset rehydration
 *
 * @param dehydratedAssets The dehydrated assets
 * @param compilation The webpack compilation
 */
function defaultRehydrateAssets(
  dehydratedAssets: IDehydratedAssets,
  compilation: webpack.compilation.Compilation
): IDehydratedAssets {
  const { assets, modules } = dehydratedAssets;

  const compilationMetadata: IModuleMinifierPluginStats | undefined = compilationMetadataMap.get(compilation);
  if (!compilationMetadata) {
    throw new Error(`Could not get compilation metadata`);
  }

  const { metadataByAssetFileName } = compilationMetadata;

  // Now assets/modules contain fully minified code. Rehydrate.
  for (const [assetName, info] of assets) {
    const banner: string = /\.m?js(\?.+)?$/.test(assetName)
      ? generateLicenseFileForAsset(compilation, info, modules)
      : '';

    const outputSource: Source = rehydrateAsset(info, modules, banner, true);
    metadataByAssetFileName.set(assetName, {
      positionByModuleId: info.renderInfo
    });
    compilation.assets[assetName] = outputSource;
  }

  return dehydratedAssets;
}

function isMinificationResultError(
  result: IModuleMinificationResult
): result is IModuleMinificationErrorResult {
  return !!result.error;
}

// Matche behavior of terser's "some" option
function isLicenseComment(comment: _IAcornComment): boolean {
  // https://github.com/terser/terser/blob/d3d924fa9e4c57bbe286b811c6068bcc7026e902/lib/output.js#L175
  return /@preserve|@lic|@cc_on|^\**!/i.test(comment.value);
}

/**
 * Webpack plugin that minifies code on a per-module basis rather than per-asset. The actual minification is handled by the input `minifier` object.
 * @public
 */
export class ModuleMinifierPlugin implements webpack.Plugin {
  public readonly hooks: IModuleMinifierPluginHooks;
  public minifier: IModuleMinifier;

  private readonly _enhancers: webpack.Plugin[];
  private readonly _sourceMap: boolean | undefined;

  private readonly _optionsForHash: IOptionsForHash;

  public constructor(options: IModuleMinifierPluginOptions) {
    this.hooks = {
      rehydrateAssets: new AsyncSeriesWaterfallHook(['dehydratedContent', 'compilation']),

      finalModuleId: new SyncWaterfallHook(['id']),

      postProcessCodeFragment: new SyncWaterfallHook(['code', 'context'])
    };

    const { minifier, sourceMap, usePortableModules = false, compressAsyncImports = false } = options;

    this._optionsForHash = {
      ...options,
      minifier: undefined,
      revision: CODE_GENERATION_REVISION
    };

    this._enhancers = [];

    if (usePortableModules) {
      this._enhancers.push(new PortableMinifierModuleIdsPlugin(this.hooks));
    }

    if (compressAsyncImports) {
      this._enhancers.push(new AsyncImportCompressionPlugin(this.hooks));
    }

    this.hooks.rehydrateAssets.tap(PLUGIN_NAME, defaultRehydrateAssets);
    this.minifier = minifier;

    this._sourceMap = sourceMap;
  }

  public static getCompilationStatistics(
    compilation: webpack.compilation.Compilation
  ): IModuleMinifierPluginStats | undefined {
    return compilationMetadataMap.get(compilation);
  }

  public apply(compiler: webpack.Compiler): void {
    for (const enhancer of this._enhancers) {
      enhancer.apply(compiler);
    }

    const {
      options: { devtool, mode }
    } = compiler;
    // The explicit setting is preferred due to accuracy, but try to guess based on devtool
    const useSourceMaps: boolean =
      typeof this._sourceMap === 'boolean'
        ? this._sourceMap
        : typeof devtool === 'string'
          ? devtool.endsWith('source-map')
          : mode === 'production' && devtool !== false;

    this._optionsForHash.sourceMap = useSourceMaps;
    const binaryConfig: Uint8Array = Buffer.from(JSON.stringify(this._optionsForHash), 'utf-8');

    compiler.hooks.thisCompilation.tap(
      PLUGIN_NAME,
      (compilation: webpack.compilation.Compilation, compilationData: _IWebpackCompilationData) => {
        const { normalModuleFactory } = compilationData;

        function addCommentExtraction(parser: webpack.compilation.normalModuleFactory.Parser): void {
          parser.hooks.program.tap(PLUGIN_NAME, (program: unknown, comments: _IAcornComment[]) => {
            (parser as IExtendedParser).state.module.factoryMeta.comments = comments.filter(isLicenseComment);
          });
        }

        normalModuleFactory.hooks.parser.for('javascript/auto').tap(PLUGIN_NAME, addCommentExtraction);
        normalModuleFactory.hooks.parser.for('javascript/dynamic').tap(PLUGIN_NAME, addCommentExtraction);
        normalModuleFactory.hooks.parser.for('javascript/esm').tap(PLUGIN_NAME, addCommentExtraction);

        /**
         * Set of local module ids that have been processed.
         */
        const submittedModules: Set<string | number> = new Set();

        /**
         * The text and comments of all minified modules.
         */
        const minifiedModules: IModuleMap = new Map();

        /**
         * The text and comments of all minified chunks. Most of these are trivial, but the runtime chunk is a bit larger.
         */
        const minifiedAssets: IAssetMap = new Map();

        const metadataByAssetFileName: Map<string, IAssetStats> = new Map();
        const compilationStatistics: IModuleMinifierPluginStats = {
          metadataByAssetFileName
        };
        compilationMetadataMap.set(compilation, compilationStatistics);

        let pendingMinificationRequests: number = 0;
        /**
         * Indicates that all files have been sent to the minifier and therefore that when pending hits 0, assets can be rehydrated.
         */
        let allRequestsIssued: boolean = false;

        let resolveMinifyPromise: () => void;

        const getRealId: (id: number | string) => number | string | undefined = (id: number | string) =>
          this.hooks.finalModuleId.call(id, compilation);

        const postProcessCode: (
          code: ReplaceSource,
          context: IPostProcessFragmentContext
        ) => ReplaceSource = (code: ReplaceSource, context: IPostProcessFragmentContext) =>
          this.hooks.postProcessCodeFragment.call(code, context);

        /**
         * Callback to invoke when a file has finished minifying.
         */
        function onFileMinified(): void {
          if (--pendingMinificationRequests === 0 && allRequestsIssued) {
            resolveMinifyPromise();
          }
        }

        const { minifier } = this;

        let minifierConnection: IMinifierConnection | undefined;

        const requestShortener: webpack.compilation.RequestShortener =
          compilation.runtimeTemplate.requestShortener;

        /**
         * Extracts the code for the module and sends it to be minified.
         * Currently source maps are explicitly not supported.
         * @param {Source} source
         * @param {Module} mod
         */
        function minifyModule(source: Source, mod: IExtendedModule): Source {
          const id: string | number | null = mod.id;

          if (id !== null && !submittedModules.has(id)) {
            // options.chunk contains the current chunk, if needed
            // Render the source, then hash, then persist hash -> module, return a placeholder

            // Initially populate the map with unminified version; replace during callback
            submittedModules.add(id);

            const realId: string | number | undefined = getRealId(id);

            if (realId !== undefined && !mod.factoryMeta.skipMinification) {
              const wrapped: ConcatSource = new ConcatSource(
                MODULE_WRAPPER_PREFIX + '\n',
                source,
                '\n' + MODULE_WRAPPER_SUFFIX
              );

              const nameForMap: string = `(modules)/${realId}`;

              const { source: wrappedCode, map } = useSourceMaps
                ? wrapped.sourceAndMap()
                : {
                    source: wrapped.source(),
                    map: undefined
                  };

              const hash: string = hashCodeFragment(wrappedCode);

              ++pendingMinificationRequests;

              minifier.minify(
                {
                  hash,
                  code: wrappedCode,
                  nameForMap: useSourceMaps ? nameForMap : undefined,
                  externals: undefined
                },
                (result: IModuleMinificationResult) => {
                  if (isMinificationResultError(result)) {
                    compilation.errors.push(result.error);
                  } else {
                    try {
                      // Have the source map display the module id instead of the minifier boilerplate
                      const sourceForMap: string = `// ${mod.readableIdentifier(
                        requestShortener
                      )}${wrappedCode.slice(MODULE_WRAPPER_PREFIX.length, -MODULE_WRAPPER_SUFFIX.length)}`;

                      const { code: minified, map: minifierMap } = result;

                      const rawOutput: Source = useSourceMaps
                        ? new SourceMapSource(
                            minified, // Code
                            nameForMap, // File
                            minifierMap!, // Base source map
                            sourceForMap, // Source from before transform
                            map!, // Source Map from before transform
                            false // Remove original source
                          )
                        : new RawSource(minified);

                      const unwrapped: ReplaceSource = new ReplaceSource(rawOutput);
                      const len: number = minified.length;

                      unwrapped.replace(0, MODULE_WRAPPER_PREFIX.length - 1, '');
                      unwrapped.replace(len - MODULE_WRAPPER_SUFFIX.length, len - 1, '');

                      const withIds: Source = postProcessCode(unwrapped, {
                        compilation,
                        module: mod,
                        loggingName: mod.identifier()
                      });
                      const cached: CachedSource = new CachedSource(withIds);

                      const minifiedSize: number = Buffer.byteLength(cached.source(), 'utf-8');
                      mod.factoryMeta.minifiedSize = minifiedSize;

                      minifiedModules.set(realId, {
                        source: cached,
                        module: mod
                      });
                    } catch (err) {
                      compilation.errors.push(err);
                    }
                  }

                  onFileMinified();
                }
              );
            } else {
              // Route any other modules straight through
              const cached: CachedSource = new CachedSource(
                postProcessCode(new ReplaceSource(source), {
                  compilation,
                  module: mod,
                  loggingName: mod.identifier()
                })
              );

              const minifiedSize: number = Buffer.byteLength(cached.source(), 'utf-8');
              mod.factoryMeta.minifiedSize = minifiedSize;

              minifiedModules.set(realId !== undefined ? realId : id, {
                source: cached,
                module: mod
              });
            }
          }

          // Return something so that this stage still produces valid ECMAScript
          return new RawSource('(function(){})');
        }

        const jsTemplate: IExtendedModuleTemplate = compilation.moduleTemplates
          .javascript as IExtendedModuleTemplate;
        const innerRender: IExtendedModuleTemplate['render'] = jsTemplate.render.bind(jsTemplate);

        // The optimizeTree hook is the last async hook that occurs before chunk rendering
        compilation.hooks.optimizeTree.tapPromise(PLUGIN_NAME, async () => {
          minifierConnection = await minifier.connectAsync();

          submittedModules.clear();

          const cache: WeakSet<IExtendedModule> = new WeakSet();
          const defaultSource: Source = new RawSource('');

          // During code generation, send the generated code to the minifier and replace with a placeholder
          // Hacking this to avoid calling .source() on a concatenated module multiple times
          jsTemplate.render = (module: IExtendedModule, dependencyTemplates, options) => {
            if (!cache.has(module)) {
              cache.add(module);
              const rendered: Source = innerRender(module, dependencyTemplates, options);

              minifyModule(rendered, module);
            }

            return defaultSource;
          };
        });

        // This should happen before any other tasks that operate during optimizeChunkAssets
        compilation.hooks.optimizeChunkAssets.tapPromise(
          TAP_BEFORE,
          async (chunks: webpack.compilation.Chunk[]): Promise<void> => {
            // Still need to minify the rendered assets
            for (const chunk of chunks) {
              const externals: string[] = [];
              const externalNames: Map<string, string> = new Map();

              const chunkModuleSet: Set<string | number> = new Set();
              const allChunkModules: Iterable<IExtendedModule> =
                chunk.modulesIterable as Iterable<IExtendedModule>;
              let hasNonNumber: boolean = false;
              for (const mod of allChunkModules) {
                if (mod.id !== null) {
                  if (typeof mod.id !== 'number') {
                    hasNonNumber = true;
                  }
                  chunkModuleSet.add(mod.id);

                  if (mod.external) {
                    // Match the identifiers generated in the AmdMainTemplatePlugin
                    // https://github.com/webpack/webpack/blob/444e59f8a427f94f0064cae6765e5a3c4b78596d/lib/AmdMainTemplatePlugin.js#L49
                    const key: string = `__WEBPACK_EXTERNAL_MODULE_${webpack.Template.toIdentifier(
                      `${mod.id}`
                    )}__`;
                    // The first two identifiers are used for function (module, exports) at the module site
                    const ordinal: number = 2 + externals.length;
                    const miniId: string = getIdentifier(ordinal);
                    externals.push(key);
                    externalNames.set(key, miniId);
                  }
                }
              }

              const chunkModules: (string | number)[] = Array.from(chunkModuleSet);
              // Sort by id before rehydration in case we rehydrate a given chunk multiple times
              chunkModules.sort(
                hasNonNumber
                  ? stringifyIdSortPredicate
                  : (x: string | number, y: string | number) => (x as number) - (y as number)
              );

              for (const assetName of chunk.files) {
                const asset: Source = compilation.assets[assetName];

                // Verify that this is a JS asset
                if (/\.m?js(\?.+)?$/.test(assetName)) {
                  ++pendingMinificationRequests;

                  const rawCode: string = asset.source() as string;
                  const nameForMap: string = `(chunks)/${assetName}`;

                  const hash: string = hashCodeFragment(rawCode);

                  minifier.minify(
                    {
                      hash,
                      code: rawCode,
                      nameForMap: useSourceMaps ? nameForMap : undefined,
                      externals
                    },
                    (result: IModuleMinificationResult) => {
                      if (isMinificationResultError(result)) {
                        compilation.errors.push(result.error);
                        // eslint-disable-next-line no-console
                        console.error(result.error);
                      } else {
                        try {
                          const { code: minified, map: minifierMap } = result;

                          let codeForMap: string = rawCode;
                          if (useSourceMaps) {
                            // Pretend the __WEBPACK_CHUNK_MODULES__ token is an array of module ids, so that the source map contains information about the module ids in the chunk
                            codeForMap = codeForMap.replace(
                              CHUNK_MODULES_TOKEN,
                              JSON.stringify(chunkModules, undefined, 2)
                            );
                          }

                          const rawOutput: Source = useSourceMaps
                            ? new SourceMapSource(
                                minified, // Code
                                nameForMap, // File
                                minifierMap!, // Base source map
                                codeForMap, // Source from before transform
                                undefined, // Source Map from before transform
                                false // Remove original source
                              )
                            : new RawSource(minified);

                          const withIds: Source = postProcessCode(new ReplaceSource(rawOutput), {
                            compilation,
                            module: undefined,
                            loggingName: assetName
                          });

                          minifiedAssets.set(assetName, {
                            source: new CachedSource(withIds),
                            modules: chunkModules,
                            chunk,
                            fileName: assetName,
                            renderInfo: new Map(),
                            externalNames
                          });
                        } catch (err) {
                          compilation.errors.push(err);
                        }
                      }

                      onFileMinified();
                    }
                  );
                } else {
                  // This isn't a JS asset. Don't try to minify the asset wrapper, though if it contains modules, those might still get replaced with minified versions.
                  minifiedAssets.set(assetName, {
                    // Still need to restore ids
                    source: postProcessCode(new ReplaceSource(asset), {
                      compilation,
                      module: undefined,
                      loggingName: assetName
                    }),
                    modules: chunkModules,
                    chunk,
                    fileName: assetName,
                    renderInfo: new Map(),
                    externalNames
                  });
                }
              }
            }

            allRequestsIssued = true;

            if (pendingMinificationRequests) {
              await new Promise<void>((resolve) => {
                resolveMinifyPromise = resolve;
              });
            }

            // Handle any error from the minifier.
            await minifierConnection?.disconnectAsync();

            // All assets and modules have been minified, hand them off to be rehydrated
            await this.hooks.rehydrateAssets.promise(
              {
                assets: minifiedAssets,
                modules: minifiedModules
              },
              compilation
            );
          }
        );

        function updateChunkHash(hash: Hash, chunk: webpack.compilation.Chunk): void {
          // Apply the options hash
          hash.update(binaryConfig);
          // Apply the hash from the minifier
          if (minifierConnection) {
            hash.update(minifierConnection.configHash, 'utf8');
          }
        }

        // Need to update chunk hashes with information from this plugin
        (compilation.chunkTemplate as unknown as IExtendedChunkTemplate).hooks.hashForChunk.tap(
          PLUGIN_NAME,
          updateChunkHash
        );
        compilation.mainTemplate.hooks.hashForChunk.tap(PLUGIN_NAME, updateChunkHash);

        // This function is written twice because the parameter order is not the same between the two hooks
        (compilation.chunkTemplate as unknown as IExtendedChunkTemplate).hooks.modules.tap(
          TAP_AFTER,
          (source: Source, chunk: webpack.compilation.Chunk, moduleTemplate: unknown) => {
            if (moduleTemplate !== compilation.moduleTemplates.javascript) {
              // This is not a JavaScript asset
              return source;
            }

            // Discard the rendered modules
            return new RawSource(CHUNK_MODULES_TOKEN);
          }
        );

        (compilation.mainTemplate as unknown as IExtendedChunkTemplate).hooks.modules.tap(
          TAP_AFTER,
          (source: Source, chunk: webpack.compilation.Chunk, hash: unknown, moduleTemplate: unknown) => {
            if (moduleTemplate !== compilation.moduleTemplates.javascript) {
              // This is not a JavaScript asset
              return source;
            }

            // Discard the rendered modules
            return new RawSource(CHUNK_MODULES_TOKEN);
          }
        );
      }
    );
  }
}
