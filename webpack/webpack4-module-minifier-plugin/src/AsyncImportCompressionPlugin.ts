// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import webpack, { type Compiler, type Plugin } from 'webpack';
import type { ReplaceSource } from 'webpack-sources';
import type { Tapable, TapOptions } from 'tapable';

const { Template } = webpack;

import { STAGE_AFTER } from './Constants.ts';
import type {
  IExtendedModule,
  IModuleMinifierPluginHooks,
  IPostProcessFragmentContext
} from './ModuleMinifierPlugin.types.ts';

const PLUGIN_NAME: 'AsyncImportCompressionPlugin' = 'AsyncImportCompressionPlugin';

const TAP_AFTER: TapOptions<'sync'> = {
  name: PLUGIN_NAME,
  stage: STAGE_AFTER
};

const ASYNC_IMPORT_PREFIX: '__IMPORT_ASYNC' = '__IMPORT_ASYNC';
const ASYNC_IMPORT_REGEX: RegExp = /__IMPORT_ASYNC[^\)]+/g;

declare class WebpackImportDependency extends webpack.compilation.Dependency {
  public module: webpack.compilation.Module;
  public block: {
    chunkGroup: webpack.compilation.ChunkGroup;
    range: [number, number];
  };
}

interface IImportDependencyTemplate {
  apply(
    dependency: WebpackImportDependency,
    source: ReplaceSource,
    runtime: webpack.compilation.RuntimeTemplate
  ): void;
}

interface IAsyncImportMetadata {
  chunkCount: number;
  chunkIds: number[];
  count: number;
  index: number;
}

interface ILocalImportMetadata {
  meta: IAsyncImportMetadata;
  module: webpack.compilation.Module;
}

function getImportDependency(compilation: webpack.compilation.Compilation): typeof WebpackImportDependency {
  for (const key of compilation.dependencyTemplates.keys()) {
    if (key.name === 'ImportDependency') {
      return key as unknown as typeof WebpackImportDependency;
    }
  }

  throw new Error(`Could not find ImportDependency!`);
}

function getImportTypeExpression(
  module: webpack.compilation.Module,
  originModule: webpack.compilation.Module
): string {
  const exportsType: string | undefined = module.buildMeta?.exportsType;
  const strict: boolean | undefined = originModule.buildMeta?.strictHarmonyModule;

  // Logic translated from:
  // https://github.com/webpack/webpack/blob/3956274f1eada621e105208dcab4608883cdfdb2/lib/RuntimeTemplate.js#L110-L122
  if (exportsType === 'namespace') {
    // Use the raw module directly
    return '';
  } else if (exportsType === 'named') {
    // Create a new namespace object and forward all exports
    return ',3';
  } else if (strict) {
    // Synthetic default export
    return ',1';
  } else {
    // If modules is marked __esModule, return raw module, otherwise create a new namespace object and forward all exports
    return ',7';
  }
}

function needChunkOnDemandLoadingCode(chunk: webpack.compilation.Chunk): boolean {
  for (const chunkGroup of chunk.groupsIterable) {
    if (chunkGroup.getNumberOfChildren() > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Plugin that replaces `Promise.all([__webpack_require__.e(1), __webpack_require__.e(12)]).then(__webpack_require__.t.bind(123,7))`
 * with more concise expressions like `__webpack_require__.ee([1,12],123,7)`, etc.
 *
 * Also ensures that the code seen by the minifier does not contain chunk ids, and is therefore portable across chunks/compilations.
 */
export class AsyncImportCompressionPlugin implements Plugin {
  private readonly _minifierHooks: IModuleMinifierPluginHooks;

  public constructor(minifierHooks: IModuleMinifierPluginHooks) {
    this._minifierHooks = minifierHooks;
  }

  public apply(compiler: Compiler): void {
    const asyncImportMap: Map<webpack.compilation.Module, Map<string, ILocalImportMetadata>> = new Map();
    const asyncImportGroups: Map<string, IAsyncImportMetadata> = new Map();
    let rankedImportGroups: IAsyncImportMetadata[] | undefined;

    this._minifierHooks.postProcessCodeFragment.tap(
      {
        name: PLUGIN_NAME,
        stage: -1
      },
      (source: ReplaceSource, context: IPostProcessFragmentContext) => {
        const code: string = source.original().source() as string;

        let localImports: Map<string, ILocalImportMetadata> | undefined;

        ASYNC_IMPORT_REGEX.lastIndex = -1;
        // RegExp.exec uses null or an array as the return type, explicitly
        let match: RegExpExecArray | null = null;
        while ((match = ASYNC_IMPORT_REGEX.exec(code))) {
          const token: string = match[0];

          if (!localImports) {
            if (!context.module) {
              context.compilation.errors.push(
                new Error(`Unexpected async import ${token} in non-module context ${context.loggingName}`)
              );
              return source;
            }

            localImports = asyncImportMap.get(context.module);
            if (!localImports) {
              context.compilation.errors.push(
                new Error(`Unexpected async import ${token} in module ${context.loggingName}`)
              );
              return source;
            }
          }

          const localImport: ILocalImportMetadata | undefined = localImports.get(token);
          if (!localImport) {
            context.compilation.errors.push(
              new Error(`Missing metadata for ${token} in module ${context.loggingName}`)
            );
            return source;
          }
          const { meta, module } = localImport;

          const chunkExpression: string = meta.index < 0 ? JSON.stringify(meta.chunkIds) : `${meta.index}`;

          const mapped: string | number | undefined = this._minifierHooks.finalModuleId.call(
            module.id!,
            context.compilation
          );
          const idExpr: string | number = mapped === undefined ? module.id! : mapped;

          // Replace with a reference or array of ideas, the target module id, and the type of import
          source.replace(
            match.index,
            ASYNC_IMPORT_REGEX.lastIndex - 1,
            `${chunkExpression},${JSON.stringify(idExpr)}${getImportTypeExpression(module, context.module!)}`
          );
        }

        return source;
      }
    );

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: webpack.compilation.Compilation) => {
      asyncImportMap.clear();
      asyncImportGroups.clear();

      compilation.hooks.beforeChunkAssets.tap(TAP_AFTER, () => {
        const ImportDependency: typeof WebpackImportDependency = getImportDependency(compilation);

        for (const module of compilation.modules) {
          const toProcess: IExtendedModule[] = module.modules || [module];

          for (const child of toProcess) {
            child.hasDependencies((dep: webpack.compilation.Dependency) => {
              if (dep instanceof ImportDependency) {
                const { module: targetModule } = dep;

                if (targetModule) {
                  let localAsyncImports: Map<string, ILocalImportMetadata> | undefined =
                    asyncImportMap.get(module);
                  if (!localAsyncImports) {
                    asyncImportMap.set(module, (localAsyncImports = new Map()));
                  }

                  const chunkGroup: webpack.compilation.ChunkGroup = dep.block.chunkGroup;
                  const chunkIds: number[] = chunkGroup
                    ? chunkGroup.chunks.map((chunk) => chunk.id!).sort()
                    : [];
                  const idString: string = chunkIds.join(';');

                  let meta: IAsyncImportMetadata | undefined = asyncImportGroups.get(idString);
                  if (!meta) {
                    asyncImportGroups.set(
                      idString,
                      (meta = {
                        chunkCount: chunkIds.length,
                        chunkIds: chunkIds,
                        count: 0,
                        index: -1
                      })
                    );
                  }
                  meta.count++;

                  const stringKey: string = `${targetModule.id}`.replace(/[^A-Za-z0-9_$]/g, '_');

                  const key: string = `${ASYNC_IMPORT_PREFIX}${stringKey}`;
                  localAsyncImports.set(key, {
                    meta,
                    module: targetModule
                  });
                }
              }
            });
          }
        }

        const rankedImports: [string, IAsyncImportMetadata][] = [...asyncImportGroups]
          .filter((x) => x[1].count > 1)
          .sort((x, y) => {
            let diff: number = y[1].count - x[1].count;
            if (!diff) {
              diff = y[1].chunkCount - x[1].chunkCount;
            }

            if (!diff) {
              diff = x[0] > y[0] ? 1 : x[0] < y[0] ? -1 : 0;
            }

            return diff;
          });

        for (let i: number = 0, len: number = rankedImports.length; i < len; i++) {
          rankedImports[i][1].index = i;
          // console.log(rankedImports[i]);
        }

        rankedImportGroups = rankedImports.map((x) => x[1]);

        const { dependencyTemplates } = compilation;

        const defaultImplementation: IImportDependencyTemplate | undefined = dependencyTemplates.get(
          ImportDependency
        ) as unknown as IImportDependencyTemplate;
        if (!defaultImplementation) {
          compilation.errors.push(new Error(`Could not find ImportDependencyTemplate`));
        }

        const customTemplate: IImportDependencyTemplate = {
          apply(
            dep: WebpackImportDependency,
            source: ReplaceSource,
            runtime: webpack.compilation.RuntimeTemplate
          ): void {
            if (dep.module) {
              const stringKey: string = `${dep.module.id}`.replace(/[^A-Za-z0-9_$]/g, '_');
              const key: string = `${ASYNC_IMPORT_PREFIX}${stringKey}`;
              const content: string = `__webpack_require__.ee(${key})`;
              source.replace(dep.block.range[0], dep.block.range[1] - 1, content);
            } else {
              defaultImplementation?.apply(dep, source, runtime);
            }
          }
        };

        // Have to do this after the official plugin in order to override
        // Typings in webpack are incorrect. This is a DependencyTemplate object
        dependencyTemplates.set(ImportDependency, customTemplate as unknown as Tapable);
      });

      compilation.mainTemplate.hooks.requireExtensions.tap(
        PLUGIN_NAME,
        (source: string, chunk: webpack.compilation.Chunk) => {
          if (!needChunkOnDemandLoadingCode(chunk)) {
            return source;
          }

          const { requireFn } = compilation.mainTemplate;
          return Template.asString([
            `var asyncImportChunkGroups = [`,
            rankedImportGroups
              ? rankedImportGroups.map((x) => Template.indent(JSON.stringify(x.chunkIds))).join(',\n')
              : '',
            `];`,
            `${requireFn}.ee = function (groupOrId, moduleId, importType) {`,
            Template.indent([
              `return Promise.all((Array.isArray(groupOrId) ? groupOrId : asyncImportChunkGroups[groupOrId]).map(function (x) { return ${requireFn}.e(x); }))`,
              `.then(importType ? ${requireFn}.t.bind(0,moduleId,importType) : ${requireFn}.bind(0,moduleId));`
            ]),
            `};`,
            source
          ]);
        }
      );
    });
  }
}
