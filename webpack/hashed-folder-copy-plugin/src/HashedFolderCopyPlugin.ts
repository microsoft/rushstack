// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import glob from 'fast-glob';
import crypto from 'crypto';
import type * as webpack from 'webpack';
import { FileSystem, Import } from '@rushstack/node-core-library';
import type * as EnhancedResolve from 'enhanced-resolve';
import { VersionDetection } from '@rushstack/webpack-plugin-utilities';
// Workaround for https://github.com/pnpm/pnpm/issues/4301
import type * as Webpack5 from '@rushstack/heft-webpack5-plugin/node_modules/webpack';

interface IParserHelpers {
  evaluateToString: (type: string) => () => void;
  toConstantDependency: (parser: webpack.compilation.normalModuleFactory.Parser, type: string) => () => void;
}

const ParserHelpers: IParserHelpers = require('webpack/lib/ParserHelpers');

// eslint-disable-next-line @typescript-eslint/naming-convention
interface ConstDependency {
  loc: unknown;
}

interface IConstDependencyType {
  new (expression: string, range: unknown, requireWebpackRequire: boolean): ConstDependency;
}

const PLUGIN_NAME: string = 'hashed-folder-copy-plugin';

const EXPRESSION_NAME: string = 'requireFolder';

interface IAcornNode<TExpression> {
  computed: boolean | undefined;
  elements: IAcornNode<unknown>[];
  key: IAcornNode<unknown> | undefined;
  name: string | undefined;
  properties: IAcornNode<unknown>[] | undefined;
  type: 'Literal' | 'ObjectExpression' | 'Identifier' | 'ArrayExpression' | unknown;
  value: TExpression;
}

interface IExpression {
  arguments: IAcornNode<unknown>[];
  range: unknown;
  loc: unknown;
}

interface IExtendedModule extends webpack.Module {
  context: string;
  buildInfo: {
    fileDependencies: Set<string>;
    assets: { [assetPath: string]: IAsset };
  };
  addDependency(dependency: ConstDependency): void;
}

interface IExtendedParser extends webpack.compilation.normalModuleFactory.Parser {
  state: {
    current: IExtendedModule;
    compilation: webpack.compilation.Compilation;
  };
}

interface IAsset {
  size(): number;
  source(): Buffer;
}

interface IResolver {
  resolveSync: typeof EnhancedResolve.sync;
  resolveAsync: typeof EnhancedResolve.default;
}

interface ICollectAssetsOptions {
  module: IExtendedModule;
  compilation: webpack.compilation.Compilation;
  requireFolderOptions: IRequireFolderOptions;
  resolver: IResolver;
}

interface IExtendedNormalModuleFactory extends webpack.compilation.NormalModuleFactory {
  getResolver(type: 'normal', options: { useSyncFileSystemCalls: boolean }): IResolver;
}

const WEBPACK_CONST_DEPENDENCY_MODULE_PATH: string = 'webpack/lib/dependencies/ConstDependency';

/**
 * @public
 */
export class HashedFolderCopyPlugin implements webpack.Plugin {
  private readonly _ConstDependency: IConstDependencyType;

  public constructor() {
    // Try to resolve webpack relative to that module that loaded this plugin.
    // Dependency templates are looked up by their constructor instance, so this
    // must be able to resolve the same `ConstDependency` module that the
    // project is using for compilation.
    let constDependencyModulePath: string | undefined;
    const parentModulePath: string | undefined = module.parent?.parent?.path;
    if (parentModulePath) {
      try {
        constDependencyModulePath = Import.resolveModule({
          modulePath: WEBPACK_CONST_DEPENDENCY_MODULE_PATH,
          baseFolderPath: parentModulePath
        });
      } catch (e) {
        // Ignore
      }
    }

    // Failing that, resolve relative to this module.
    this._ConstDependency = require(constDependencyModulePath || WEBPACK_CONST_DEPENDENCY_MODULE_PATH);
  }

  public apply(compiler: webpack.Compiler): void {
    // Casting here because VersionDetection refers to webpack 5 typings
    let needToWarnAboutWebpack5: boolean = VersionDetection.isWebpack5(
      compiler as unknown as Webpack5.Compiler
    );

    compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (normalModuleFactory) => {
      const normalResolver: IResolver = (normalModuleFactory as IExtendedNormalModuleFactory).getResolver(
        'normal',
        { useSyncFileSystemCalls: true }
      );
      const handler: (parser: webpack.compilation.normalModuleFactory.Parser) => void = (
        baseParser: webpack.compilation.normalModuleFactory.Parser
      ) => {
        const parser: IExtendedParser = baseParser as IExtendedParser;
        parser.hooks.call.for(EXPRESSION_NAME).tap(PLUGIN_NAME, (expression: IExpression) => {
          const compilation: webpack.compilation.Compilation = parser.state.compilation;
          if (needToWarnAboutWebpack5) {
            compilation.warnings.push(
              `HashedFolderCopyPlugin is not fully supported supported in webpack 5. ` +
                `Unexpected behavior is likely to occur.`
            );
            needToWarnAboutWebpack5 = false; // Only warn once
          }

          let errorMessage: string | undefined;
          let requireFolderOptions: IRequireFolderOptions | undefined = undefined;
          if (expression.arguments.length !== 1) {
            errorMessage = `Exactly one argument is required to be passed to "${EXPRESSION_NAME}"`;
          } else {
            const argument: IAcornNode<IRequireFolderOptions> = expression
              .arguments[0] as IAcornNode<IRequireFolderOptions>;
            try {
              requireFolderOptions = this._evaluateAcornNode(argument) as IRequireFolderOptions;
            } catch (e) {
              errorMessage = (e as Error).message;
            }

            if (requireFolderOptions) {
              if (
                !requireFolderOptions.outputFolder ||
                typeof requireFolderOptions.outputFolder !== 'string'
              ) {
                errorMessage = 'The options object must have a "outputFolder" property that is a string';
              } else if (!requireFolderOptions.sources || !Array.isArray(requireFolderOptions.sources)) {
                errorMessage = 'The options object must have a "sources" property that is an array';
              } else {
                for (const source of requireFolderOptions.sources) {
                  if (!source.globsBase || typeof source.globsBase !== 'string') {
                    errorMessage = 'Each "sources" element must have a string "globsBase" property';
                  } else if (
                    !source.globPatterns ||
                    !Array.isArray(source.globPatterns) ||
                    source.globPatterns.some((globPattern) => !globPattern || typeof globPattern !== 'string')
                  ) {
                    errorMessage =
                      'Each "sources" element must have a "globPatterns" property that is an array of glob strings';
                  }
                }
              }
            }
          }

          const currentModule: IExtendedModule = parser.state.current;
          let dependencyText: string;
          if (!requireFolderOptions) {
            dependencyText = this._renderError(errorMessage!);
            compilation.errors.push(new Error(errorMessage));
          } else {
            dependencyText = this._collectAssets({
              module: currentModule,
              compilation,
              requireFolderOptions,
              resolver: normalResolver
            });
          }

          const errorDependency: ConstDependency = new this._ConstDependency(
            `/* ${EXPRESSION_NAME} */ ${dependencyText}`,
            expression.range,
            false
          );
          errorDependency.loc = expression.loc;
          currentModule.addDependency(errorDependency);
        });

        parser.hooks.evaluateTypeof
          .for(EXPRESSION_NAME)
          .tap(PLUGIN_NAME, ParserHelpers.evaluateToString('function'));

        parser.hooks.typeof
          .for(EXPRESSION_NAME)
          .tap(PLUGIN_NAME, ParserHelpers.toConstantDependency(parser, JSON.stringify('function')));
      };

      normalModuleFactory.hooks.parser.for('javascript/auto').tap(PLUGIN_NAME, handler);
      normalModuleFactory.hooks.parser.for('javascript/dynamic').tap(PLUGIN_NAME, handler);
    });
  }

  private _collectAssets(options: ICollectAssetsOptions): string {
    const { module, compilation, requireFolderOptions, resolver } = options;

    // Map of asset names (to be prepended by the outputFolder) to asset objects
    const assetsToAdd: Map<string, IAsset> = new Map<string, IAsset>();

    for (const source of requireFolderOptions.sources) {
      const { globsBase, globPatterns } = source;

      let resolvedGlobsBase: string;
      if (globsBase.startsWith('.')) {
        // Does this look like a relative path?
        resolvedGlobsBase = path.resolve(module.context, globsBase);
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

        let packagePath: string;
        try {
          const resolveResult: string = resolver.resolveSync(
            {},
            module.context,
            `${packageName}/package.json`
          );
          packagePath = path.dirname(resolveResult);
        } catch (e) {
          const errorMessage: string = `Unable to resolve package "${packageName}"`;
          compilation.errors.push(new Error(errorMessage));
          return this._renderError(errorMessage);
        }

        resolvedGlobsBase = path.join(packagePath, pathInsidePackage);
      }

      const globResults: string[] = glob.sync(globPatterns, { cwd: resolvedGlobsBase, onlyFiles: true });
      for (const globResult of globResults) {
        if (assetsToAdd.has(globResult)) {
          const errorMessage: string = `Two files resolve to the same output path "${globResult}"`;
          compilation.errors.push(new Error(errorMessage));
          return this._renderError(errorMessage);
        }

        const globResultFullPath: string = path.resolve(resolvedGlobsBase, globResult);

        const assetContents: Buffer = FileSystem.readFileToBuffer(globResultFullPath);
        assetsToAdd.set(globResult, { size: () => assetContents.byteLength, source: () => assetContents });
        module.buildInfo.fileDependencies.add(globResultFullPath);
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
      hash.update(assetsToAdd.get(assetPath)!.source());
    }

    const hashTokenRegex: RegExp = /\[hash:?(\d+)?\]/g;
    const hashDigest: string = hash.digest('hex');
    let pathPrefix: string = requireFolderOptions.outputFolder.replace(hashTokenRegex, (match, length) => {
      const hashLength: number | undefined = length ? Number.parseInt(length, 10) : undefined;
      if (hashLength) {
        return hashDigest.slice(0, hashLength);
      } else {
        return hashDigest;
      }
    });
    pathPrefix = path.posix.join(pathPrefix, '/'); // Ensure trailing slash

    if (!module.buildInfo.assets) {
      module.buildInfo.assets = {};
    }
    const existingAssetNames: Set<string> = new Set<string>(Object.keys(compilation.assets));
    for (const [assetPath, asset] of assetsToAdd.entries()) {
      const fullAssetPath: string = path.posix.join(pathPrefix, assetPath);
      if (existingAssetNames.has(fullAssetPath)) {
        const errorMessage: string = `An asset with path "${fullAssetPath}" already exists`;
        compilation.errors.push(new Error(errorMessage));
        return this._renderError(errorMessage);
      }

      compilation.assets[fullAssetPath] = asset;
      module.buildInfo.assets[fullAssetPath] = asset;
    }

    return `__webpack_require__.p + ${JSON.stringify(pathPrefix)}`;
  }

  private _renderError(errorMessage: string): string {
    return `(function () { throw new Error(${JSON.stringify(errorMessage)}); })()`;
  }

  private _evaluateAcornNode(node: IAcornNode<unknown>): unknown {
    switch (node.type) {
      case 'Literal': {
        return node.value;
      }

      case 'ObjectExpression': {
        const result: Record<string, unknown> = {};

        for (const property of node.properties!) {
          const keyNode: IAcornNode<unknown> = property.key!;
          if (keyNode.type !== 'Identifier' || keyNode.computed) {
            throw new Error('Property keys must be non-computed identifiers');
          }

          const key: string = keyNode.name!;
          const value: unknown = this._evaluateAcornNode(property.value as IAcornNode<unknown>);
          result[key] = value;
        }

        return result;
      }

      case 'ArrayExpression': {
        return node.elements.map((element) => this._evaluateAcornNode(element));
      }

      default: {
        throw new Error(`Unsupported node type: "${node.type}"`);
      }
    }
  }
}
