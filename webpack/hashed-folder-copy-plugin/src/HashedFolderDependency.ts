// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import crypto from 'node:crypto';
import glob from 'fast-glob';
import webpack from 'webpack';
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

const makeSerializable: (
  constructor: typeof HashedFolderDependency,
  request: string
) => void = require('webpack/lib/util/makeSerializable');

export class HashedFolderDependencyTemplate extends webpack.dependencies.NullDependency.Template {
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

export class HashedFolderDependency extends webpack.dependencies.NullDependency {
  public /* readonly - except for the `deserialize` function */ requireFolderOptions: IRequireFolderOptions;
  public /* readonly - except for the `deserialize` function */ range: Range;
  private _hashUpdate: string | undefined;
  public expression: string | undefined;

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

  public async processAssetsAsync(compilation: webpack.Compilation): Promise<void> {
    if (!this.expression) {
      this.expression = await this._collectAssetsAndGetExpressionAsync(compilation);
    }
  }

  private async _collectAssetsAndGetExpressionAsync(compilation: webpack.Compilation): Promise<string> {
    // Map of asset names (to be prepended by the outputFolder) to asset contents
    const assetsToAdd: Map<string, string | Buffer> = new Map();

    const module: webpack.NormalModule = compilation.moduleGraph.getParentModule(
      this
    ) as webpack.NormalModule;
    const context: string | null = module.context;
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
              resolver = compilation.resolverFactory.get('normal', module.resolveOptions);
            }

            const resolveResult: string | false = resolver.resolveSync(
              {},
              context,
              `${packageName}/package.json`
            );
            if (resolveResult) {
              packagePath = path.dirname(resolveResult);
            }
          }
        } catch (e) {
          // Ignore - return an error below
        }

        if (packagePath) {
          resolvedGlobsBase = path.join(packagePath, pathInsidePackage);
        } else {
          const errorMessage: string = `Unable to resolve package "${packageName}"`;
          compilation.errors.push(new webpack.WebpackError(errorMessage));
          return renderError(errorMessage);
        }
      }

      const globResults: string[] = await glob(globPatterns, {
        cwd: resolvedGlobsBase,
        onlyFiles: true,
        fs: compilation.inputFileSystem as unknown as glob.FileSystemAdapter // These types are not exactly the same, but they're close enough
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
            compilation.inputFileSystem.readFile.bind(compilation.inputFileSystem),
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

    if (!module.buildInfo.assets) {
      module.buildInfo.assets = {};
    }
    const existingAssetNames: Set<string> = new Set<string>(Object.keys(compilation.assets));
    for (const [assetPath, asset] of assetsToAdd.entries()) {
      const fullAssetPath: string = path.posix.join(pathPrefix, assetPath);
      if (existingAssetNames.has(fullAssetPath)) {
        const errorMessage: string = `An asset with path "${fullAssetPath}" already exists`;
        compilation.errors.push(new webpack.WebpackError(errorMessage));
        return renderError(errorMessage);
      }

      const assetSource: webpack.sources.RawSource = new webpack.sources.RawSource(asset);
      compilation.emitAsset(fullAssetPath, assetSource);
      module.buildInfo.assets[fullAssetPath] = assetSource;
    }

    return `${webpack.RuntimeGlobals.publicPath} + ${JSON.stringify(pathPrefix)}`;
  }
}

makeSerializable(HashedFolderDependency, __filename);
