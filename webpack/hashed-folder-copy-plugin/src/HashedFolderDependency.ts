// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import crypto from 'node:crypto';

import glob from 'fast-glob';
import type webpack from 'webpack';
import type { SourceLocation } from 'estree';

import { LegacyAdapters } from '@rushstack/node-core-library';

import { renderError } from './HashedFolderCopyPlugin';
import type {
  ConnectionState,
  DependencyTemplateContext,
  ObjectDeserializerContext,
  ObjectSerializerContext,
  Range,
  ResolverWithOptions,
  UpdateHashContextDependency,
  WebpackHash
} from './webpackTypes';

export interface IHashedFolderDependency extends webpack.dependencies.NullDependency {
  processAssetsAsync(compilation: webpack.Compilation, globFs: glob.FileSystemAdapter): Promise<void>;
}

export interface IExports {
  HashedFolderDependencyTemplate: typeof webpack.dependencies.NullDependency.Template;
  HashedFolderDependency: {
    new (
      requireFolderOptions: IRequireFolderOptions,
      range: Range,
      // eslint-disable-next-line @rushstack/no-new-null
      loc: SourceLocation | null | undefined
    ): IHashedFolderDependency;
  };
}

const exportsCache: WeakMap<typeof webpack, IExports> = new WeakMap();

/**
 * @remarks
 * This has to be done this way because webpack 5 wants to ensure that the `webpack` instance that's used in the
 * compilation, including by extended classes, is a pure singleton
 */
export function getHashedFolderDependencyForWebpackInstance(webpack: typeof import('webpack')): IExports {
  let hashedFolderDependency: IExports | undefined = exportsCache.get(webpack);
  if (!hashedFolderDependency) {
    hashedFolderDependency = _getHashedFolderDependencyForWebpackInstance(webpack);
    exportsCache.set(webpack, hashedFolderDependency);
  }

  return hashedFolderDependency;
}

function _getHashedFolderDependencyForWebpackInstance(webpack: typeof import('webpack')): IExports {
  class HashedFolderDependencyTemplate extends webpack.dependencies.NullDependency.Template {
    public apply(
      { range, expression }: HashedFolderDependency,
      source: webpack.sources.ReplaceSource,
      templateContext: DependencyTemplateContext
    ): void {
      templateContext.runtimeRequirements.add(webpack.RuntimeGlobals.publicPath);

      if (expression === undefined) {
        throw new Error(
          'Expression must be defined. This indicates that the compilation\'s "finishModules" hook did not complete'
        );
      } else if (typeof range === 'number') {
        source.insert(range, expression);
      } else {
        const [rangeStart, rangeEnd] = range;
        source.replace(rangeStart, rangeEnd - 1, expression);
      }
    }
  }

  class HashedFolderDependency
    extends webpack.dependencies.NullDependency
    implements IHashedFolderDependency
  {
    public /* readonly - except for the `deserialize` function */ requireFolderOptions: IRequireFolderOptions;
    public /* readonly - except for the `deserialize` function */ range: Range;
    public expression: string | undefined;
    private _hashUpdate: string | undefined;

    public constructor(
      requireFolderOptions: IRequireFolderOptions,
      range: Range,
      // eslint-disable-next-line @rushstack/no-new-null
      loc: SourceLocation | null | undefined
    ) {
      super();

      this.requireFolderOptions = requireFolderOptions;
      this.range = range;

      if (loc) {
        this.loc = loc;
      }
    }

    public updateHash(hash: WebpackHash, context: UpdateHashContextDependency): void {
      if (!this._hashUpdate) {
        const requireFolderOptionsStr: string = JSON.stringify(this.requireFolderOptions);
        this._hashUpdate = `${requireFolderOptionsStr}|${this.range}`;
      }

      hash.update(this._hashUpdate);
    }

    public getModuleEvaluationSideEffectsState(moduleGraph: webpack.ModuleGraph): ConnectionState {
      return false;
    }

    public serialize(context: ObjectSerializerContext): void {
      const { write } = context;
      write(this.requireFolderOptions);
      write(this.range);
      super.serialize(context);
    }

    public deserialize(context: ObjectDeserializerContext): void {
      const { read } = context;
      this.requireFolderOptions = read() as IRequireFolderOptions;
      this.range = read() as Range;
      super.deserialize(context);
    }

    public async processAssetsAsync(
      compilation: webpack.Compilation,
      globFs: glob.FileSystemAdapter
    ): Promise<void> {
      if (!this.expression) {
        this.expression = await this._collectAssetsAndGetExpressionAsync(compilation, globFs);
      }
    }

    private async _collectAssetsAndGetExpressionAsync(
      compilation: webpack.Compilation,
      globFs: glob.FileSystemAdapter
    ): Promise<string> {
      // Map of context-relative asset names to asset contents
      const assetsToAdd: Map<string, string | Buffer> = new Map();

      const parentModule: webpack.NormalModule = compilation.moduleGraph.getParentModule(
        this
      ) as webpack.NormalModule;
      const context: string | null = parentModule.context;
      let resolver: ResolverWithOptions | undefined;
      for (const source of this.requireFolderOptions.sources) {
        const { globsBase, globPatterns } = source;

        let resolvedGlobsBase: string;
        if (globsBase.startsWith('.')) {
          // Does this look like a relative path?
          if (!context) {
            const errorMessage: string = `Unable to resolve relative path "${globsBase}" because the module has no context`;
            compilation.errors.push(new webpack.WebpackError(errorMessage));
            return renderError(errorMessage);
          } else {
            resolvedGlobsBase = path.resolve(context, globsBase);
          }
        } else if (path.isAbsolute(globsBase)) {
          // This is an absolute path
          resolvedGlobsBase = globsBase;
        } else {
          // This looks like a NodeJS module path
          let slashAfterPackageNameIndex: number;
          if (globsBase.startsWith('@')) {
            // The package name has a scope
            slashAfterPackageNameIndex = globsBase.indexOf('/', globsBase.indexOf('/') + 1);
          } else {
            slashAfterPackageNameIndex = globsBase.indexOf('/');
          }

          let packageName: string;
          let pathInsidePackage: string;
          if (slashAfterPackageNameIndex === -1) {
            packageName = globsBase;
            pathInsidePackage = '';
          } else {
            packageName = globsBase.slice(0, slashAfterPackageNameIndex);
            pathInsidePackage = globsBase.slice(slashAfterPackageNameIndex + 1);
          }

          let packagePath: string | undefined;
          try {
            if (!context) {
              const errorMessage: string = `Unable to resolve package "${packageName}" because the module has no context`;
              compilation.errors.push(new webpack.WebpackError(errorMessage));
              return renderError(errorMessage);
            } else {
              if (!resolver) {
                resolver = compilation.resolverFactory.get('normal', parentModule.resolveOptions);
              }

              // The `resolver.resolve` type is too complex for LegacyAdapters.convertCallbackToPromise
              packagePath = await new Promise((resolve, reject) => {
                resolver!.resolve({}, context, `${packageName}/package.json`, {}, (err, result) => {
                  if (err) {
                    reject(err);
                  } else if (result) {
                    resolve(path.dirname(result));
                  } else {
                    reject(new Error(`Unable to resolve package "${packageName}"`));
                  }
                });
              });
            }
          } catch (e) {
            compilation.errors.push(e);
          }

          if (packagePath) {
            resolvedGlobsBase = path.join(packagePath, pathInsidePackage);
          } else {
            const errorMessage: string = `Unable to resolve package "${packageName}"`;
            compilation.errors.push(new webpack.WebpackError(errorMessage));
            return renderError(errorMessage);
          }
        }

        const boundReadFile: typeof compilation.inputFileSystem.readFile =
          compilation.inputFileSystem.readFile.bind(compilation.inputFileSystem);

        // TODO: Add all folders that get read to `parentModule.buildInfo.contextDependencies`
        // At this point in the compilation, that property has been set to undefined, so we need to do this earlier
        const globResults: string[] = await glob(globPatterns, {
          cwd: resolvedGlobsBase,
          onlyFiles: true,
          fs: globFs
        });
        for (const globResult of globResults) {
          if (assetsToAdd.has(globResult)) {
            const errorMessage: string = `Two files resolve to the same output path "${globResult}"`;
            compilation.errors.push(new webpack.WebpackError(errorMessage));
            return renderError(errorMessage);
          }

          const globResultFullPath: string = path.resolve(resolvedGlobsBase, globResult);

          let assetContents: string | Buffer | undefined;
          try {
            assetContents = (await LegacyAdapters.convertCallbackToPromise(
              boundReadFile,
              globResultFullPath
            )) as string | Buffer;
          } catch (e) {
            compilation.errors.push(new webpack.WebpackError(e.message));
            return renderError(e.message);
          }

          assetsToAdd.set(globResult, assetContents);
        }
      }

      const hash: crypto.Hash = crypto.createHash('md5');
      // If the webpack config specified a salt, apply it here
      const hashSalt: string | undefined = compilation.outputOptions?.hashSalt;
      if (hashSalt) {
        hash.update(hashSalt);
      }

      // Sort the paths to maximize hash stability
      for (const assetPath of Array.from(assetsToAdd.keys()).sort()) {
        hash.update(assetPath);
        hash.update(assetsToAdd.get(assetPath)!);
      }

      const hashTokenRegex: RegExp = /\[hash:?(\d+)?\]/g;
      const hashDigest: string = hash.digest('hex');
      let pathPrefix: string = this.requireFolderOptions.outputFolder.replace(
        hashTokenRegex,
        (match, length) => {
          const hashLength: number | undefined = length ? Number.parseInt(length, 10) : undefined;
          if (hashLength) {
            return hashDigest.slice(0, hashLength);
          } else {
            return hashDigest;
          }
        }
      );
      pathPrefix = path.posix.join(pathPrefix, '/'); // Ensure trailing slash

      const { buildInfo = (parentModule.buildInfo = {}) } = parentModule;

      const { assets = (buildInfo.assets = {}) } = buildInfo;

      const existingAssetNames: Set<string> = new Set<string>(Object.keys(compilation.assets));
      for (const [assetPath, asset] of assetsToAdd) {
        const fullAssetPath: string = path.posix.join(pathPrefix, assetPath);
        if (existingAssetNames.has(fullAssetPath)) {
          const errorMessage: string = `An asset with path "${fullAssetPath}" already exists`;
          compilation.errors.push(new webpack.WebpackError(errorMessage));
          return renderError(errorMessage);
        }

        const assetSource: webpack.sources.RawSource = new webpack.sources.RawSource(asset);
        compilation.emitAsset(fullAssetPath, assetSource);
        assets[fullAssetPath] = assetSource;
      }

      return `${webpack.RuntimeGlobals.publicPath} + ${JSON.stringify(pathPrefix)}`;
    }
  }

  const makeSerializable: (
    constructor: typeof HashedFolderDependency,
    request: string
  ) => void = require('webpack/lib/util/makeSerializable');

  makeSerializable(HashedFolderDependency, __filename);

  return { HashedFolderDependencyTemplate, HashedFolderDependency };
}
