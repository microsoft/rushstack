import { RawSource, Source } from 'webpack-sources';
import * as webpack from 'webpack';
import { AsyncSeriesWaterfallHook, Tap } from 'tapable';
import * as RequestShortener from 'webpack/lib/RequestShortener';
import {
  CHUNK_MODULES_TOKEN,
  MODULE_WRAPPER_PREFIX,
  MODULE_WRAPPER_SUFFIX,
  STAGE_BEFORE,
  STAGE_AFTER
} from './Constants';
import {
  IModuleMinifier,
  IModuleMinifierPluginOptions,
  IModuleMinificationResult,
  IModuleMinificationErrorResult,
  IModuleMap,
  IAssetMap,
  IExtendedModule,
  IModuleMinifierPluginHooks,
  IDehydratedAssets
} from './ModuleMinifierPlugin.types';
import { generateLicenseFileForAsset } from './GenerateLicenseFileForAsset';
import { rehydrateAsset } from './RehydrateAsset';
import { StableMinifierIdsPlugin } from './StableMinifierIdsPlugin';

// The name of the plugin, for use in taps
const PLUGIN_NAME: 'ModuleMinifierPlugin' = 'ModuleMinifierPlugin';

const TAP_BEFORE: Tap = {
  name: PLUGIN_NAME,
  stage: STAGE_BEFORE
} as Tap;
const TAP_AFTER: Tap = {
  name: PLUGIN_NAME,
  stage: STAGE_AFTER
} as Tap;

/**
 * Base implementation of asset rehydration
 *
 * @param dehydratedAssets The dehydrated assets
 * @param compilation The webpack compilation
 */
function defaultRehydrateAssets(dehydratedAssets: IDehydratedAssets, compilation: webpack.compilation.Compilation): IDehydratedAssets {
  const {
    assets,
    modules
  } = dehydratedAssets;

  // Now assets/modules contain fully minified code. Rehydrate.
  for (const [assetName, info] of assets) {
    const banner: string = generateLicenseFileForAsset(compilation, info, modules)

    const outputSource: Source = rehydrateAsset(info, modules, banner);
    compilation.assets[assetName] = outputSource;
  }

  return dehydratedAssets;
}

function isMinificationResultError(result: IModuleMinificationResult): result is IModuleMinificationErrorResult {
  return !!result.error;
}

/**
 * Webpack plugin that minifies code on a per-module basis rather than per-asset. The actual minification is handled by the input `minifier` object.
 * @public
 */
export class ModuleMinifierPlugin {
  public readonly hooks: IModuleMinifierPluginHooks;
  public readonly minifier: IModuleMinifier;
  public readonly stableIdsPlugin: StableMinifierIdsPlugin | undefined;

  public constructor(options: IModuleMinifierPluginOptions) {
    this.hooks = {
      rehydrateAssets: new AsyncSeriesWaterfallHook([
        'dehydratedContent',
        'compilation'
      ])
    };

    if (options.usePortableModules) {
      this.stableIdsPlugin = new StableMinifierIdsPlugin();
    }

    this.hooks.rehydrateAssets.tap(PLUGIN_NAME, defaultRehydrateAssets);
    this.minifier = options.minifier;
  }

  public apply(compiler: webpack.Compiler): void {
    // Ensure that "EXTERNAL MODULE: " comments are portable and module version invariant
    const baseShorten: (request: string) => string = RequestShortener.prototype.shorten;
    RequestShortener.prototype.shorten = function (this: RequestShortener, request: string): string {
      const baseResult: string = baseShorten.call(this, request);
      const nodeModules: '/node_modules/' = '/node_modules/';

      if (!baseResult) {
        return baseResult;
      }

      const nodeModulesIndex: number = baseResult.lastIndexOf(nodeModules);
      if (nodeModulesIndex < 0) {
        return baseResult;
      }

      const nodeModulePath: string = baseResult.slice(nodeModulesIndex + nodeModules.length);
      this.cache.set(request, nodeModulePath);
      return nodeModulePath;
    }

    const {
      stableIdsPlugin
    } = this;

    if (stableIdsPlugin) {
      stableIdsPlugin.apply(compiler);
    }

    const postProcessCode: (code: string, context: string) => string = (
      stableIdsPlugin ? stableIdsPlugin.restoreIdsInCode.bind(stableIdsPlugin) : (code: string) => code
    );
    const getRealId: (id: string | number) => string | number | undefined = (
      stableIdsPlugin ? stableIdsPlugin.getMappedId.bind(stableIdsPlugin) : (id: string | number) => id
    );

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: webpack.compilation.Compilation) => {
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

      let pendingMinificationRequests: number = 0;
      /**
       * Indicates that all files have been sent to the minifier and therefore that when pending hits 0, assets can be rehydrated.
       */
      let allRequestsIssued: boolean = false;

      let resolveMinifyPromise: () => void;

      /**
       * Callback to invoke when a file has finished minifying.
       */
      function onFileMinified(): void {
        if (--pendingMinificationRequests === 0 && allRequestsIssued) {
          resolveMinifyPromise();
        }
      };

      /**
       * Callback to invoke for a chunk during render to replace the modules with CHUNK_MODULES_TOKEN
       */
      function dehydrateAsset(modules: webpack.compilation.Module[], chunk: webpack.compilation.Chunk): Source {
        for (const mod of chunk.modulesIterable) {
          if (!submittedModules.has(mod.id)) {
            console.error(`Chunk ${chunk.id} failed to render module ${mod.id} for ${mod.resourcePath}`);
          }
        }

        // Discard the rendered modules
        return new RawSource(CHUNK_MODULES_TOKEN);
      };

      const {
        minifier
      } = this;

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
          const code: string = source.source();

          // Initially populate the map with unminified version; replace during callback
          submittedModules.add(id);

          const realId: string | number | undefined = getRealId(id);

          if (code.length && realId !== undefined && !mod.skipMinification) {
            ++pendingMinificationRequests;
            const wrappedCode: string = `${MODULE_WRAPPER_PREFIX}${code}${MODULE_WRAPPER_SUFFIX}`;

            minifier.minify(wrappedCode, (result: IModuleMinificationResult) => {
              if (isMinificationResultError(result)) {
                compilation.errors.push(result.error);
                return;
              }

              const {
                code: minified,
                extractedComments
              } = result;

              const unwrapped: string = minified.slice(MODULE_WRAPPER_PREFIX.length, -MODULE_WRAPPER_SUFFIX.length);
              const withIds: string = postProcessCode(unwrapped, mod.identifier());

              minifiedModules.set(realId, {
                code: withIds,
                extractedComments,
                module: mod
              });

              onFileMinified();
            });
          } else {
            // Route any other modules straight through
            minifiedModules.set(realId !== undefined ? realId : id, {
              code: postProcessCode(code, mod.identifier()),
              extractedComments: [],
              module: mod
            });
          }
        }

        // Return something so that this stage still produces valid ECMAScript
        return new RawSource('(function(){})');
      };

      // During code generation, send the generated code to the minifier and replace with a placeholder
      compilation.moduleTemplates.javascript.hooks.package.tap(TAP_AFTER, minifyModule);

      async function optimizeChunkAssets(chunks: webpack.compilation.Chunk[]): Promise<void> {
        // Still need to minify the rendered assets
        for (const chunk of chunks) {
          const chunkModules: (string | number)[] = [];
          const allChunkModules: Iterable<IExtendedModule> = chunk.modulesIterable;
          let hasNonNumber: boolean = false;
          for (const mod of allChunkModules) {
            if (mod.id !== null) {
              if (typeof mod.id !== 'number') {
                hasNonNumber = true;
              }
              chunkModules.push(mod.id);
            }
          }

          // Sort by id before rehydration in case we rehydrate a given chunk multiple times
          if (!hasNonNumber) {
            chunkModules.sort((x: number, y: number) => x - y);
          }

          for (const assetName of chunk.files) {
            const asset: Source = compilation.assets[assetName];

            const rawCode: string = asset.source();

            ++pendingMinificationRequests;

            minifier.minify(rawCode, (result: IModuleMinificationResult) => {
              if (isMinificationResultError(result)) {
                compilation.errors.push(result.error);
                return;
              }

              const {
                code,
                extractedComments
              } = result;

              const withIds: string = chunk.hasRuntime() ? postProcessCode(code, assetName) : code;

              minifiedAssets.set(assetName, {
                code: withIds,
                extractedComments,
                modules: chunkModules,
                chunk,
                fileName: assetName
              });

              onFileMinified();
            });
          }
        }

        allRequestsIssued = true;

        if (pendingMinificationRequests) {
          await new Promise((resolve) => {
            resolveMinifyPromise = resolve;
          });;
        }

        // All assets and modules have been minified, hand them off to be rehydrated

        // Clone the maps for safety, even though we won't be using them in the plugin anymore
        const assets: IAssetMap = new Map(minifiedAssets);
        const modules: IModuleMap = new Map(minifiedModules);

        await this.hooks.rehydrateAssets.promise({
          assets,
          modules
        }, compilation);
      };

      // This should happen before any other tasks that operate during optimizeChunkAssets
      compilation.hooks.optimizeChunkAssets.tapPromise(TAP_BEFORE, optimizeChunkAssets);

      for (const template of [compilation.chunkTemplate, compilation.mainTemplate]) {
        // @ts-ignore Incompatible type definitions. Suffice to say, this hook exists.
        template.hooks.modules.tap(TAP_AFTER, dehydrateAsset);
      }
    });
  }
}