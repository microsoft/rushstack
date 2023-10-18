// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import glob from 'fast-glob';
import crypto from 'crypto';
import { FileSystem } from '@rushstack/node-core-library';
import type { CallExpression, Expression, UnaryExpression } from 'estree';
import webpack from 'webpack';

type BasicEvaluatedExpressionHook = ReturnType<
  typeof webpack.javascript.JavascriptParser.prototype.hooks.evaluateTypeof.for
>;
type BasicEvaluatedExpression = ReturnType<BasicEvaluatedExpressionHook['call']>;

interface IParserHelpers {
  evaluateToString: (type: string) => (exp: UnaryExpression) => BasicEvaluatedExpression;
  toConstantDependency: (parser: webpack.Parser, type: string) => (exp: Expression) => true;
}

const ParserHelpers: IParserHelpers = require('webpack/lib/javascript/JavascriptParserHelpers');

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

interface ICollectAssetsOptions {
  module: webpack.Module;
  compilation: webpack.Compilation;
  requireFolderOptions: IRequireFolderOptions;
  resolver: ResolverWithOptions;
}

type NormalModuleFactory = Parameters<typeof webpack.Compiler.prototype.hooks.normalModuleFactory.call>[0];
type ResolverWithOptions = ReturnType<NormalModuleFactory['getResolver']>;

/**
 * @public
 */
export class HashedFolderCopyPlugin implements webpack.WebpackPluginInstance {
  public apply(compiler: webpack.Compiler): void {
    compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (normalModuleFactory) => {
      const normalResolver: ResolverWithOptions = normalModuleFactory.getResolver('normal', {
        useSyncFileSystemCalls: true
      });
      const handler: (parser: webpack.javascript.JavascriptParser) => void = (
        parser: webpack.javascript.JavascriptParser
      ) => {
        parser.hooks.call.for(EXPRESSION_NAME).tap(PLUGIN_NAME, (baseExpression: Expression) => {
          const expression: CallExpression = baseExpression as CallExpression;
          const compilation: webpack.Compilation = parser.state.compilation;

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

          const currentModule: webpack.NormalModule = parser.state.current;
          let dependencyText: string;
          if (!requireFolderOptions) {
            dependencyText = this._renderError(errorMessage!);
            compilation.errors.push(new webpack.WebpackError(errorMessage));
          } else {
            dependencyText = this._collectAssets({
              module: currentModule,
              compilation,
              requireFolderOptions,
              resolver: normalResolver
            });
          }

          const dependency: webpack.dependencies.ConstDependency = new webpack.dependencies.ConstDependency(
            `/* ${EXPRESSION_NAME} */ ${dependencyText}`,
            expression.range!,
            [webpack.RuntimeGlobals.publicPath]
          );
          if (expression.loc) {
            dependency.loc = expression.loc;
          }

          currentModule.addDependency(dependency);
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
    const assetsToAdd: Map<string, Buffer> = new Map<string, Buffer>();

    for (const source of requireFolderOptions.sources) {
      const { globsBase, globPatterns } = source;

      let resolvedGlobsBase: string;
      if (globsBase.startsWith('.')) {
        // Does this look like a relative path?
        if (!module.context) {
          const errorMessage: string = `Unable to resolve relative path "${globsBase}" because the module has no context`;
          compilation.errors.push(new webpack.WebpackError(errorMessage));
          return this._renderError(errorMessage);
        } else {
          resolvedGlobsBase = path.resolve(module.context, globsBase);
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
          if (!module.context) {
            const errorMessage: string = `Unable to resolve package "${packageName}" because the module has no context`;
            compilation.errors.push(new webpack.WebpackError(errorMessage));
            return this._renderError(errorMessage);
          } else {
            const resolveResult: string | false = resolver.resolveSync(
              {},
              module.context,
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
          return this._renderError(errorMessage);
        }
      }

      const globResults: string[] = glob.sync(globPatterns, { cwd: resolvedGlobsBase, onlyFiles: true });
      for (const globResult of globResults) {
        if (assetsToAdd.has(globResult)) {
          const errorMessage: string = `Two files resolve to the same output path "${globResult}"`;
          compilation.errors.push(new webpack.WebpackError(errorMessage));
          return this._renderError(errorMessage);
        }

        const globResultFullPath: string = path.resolve(resolvedGlobsBase, globResult);

        const assetContents: Buffer = FileSystem.readFileToBuffer(globResultFullPath);
        assetsToAdd.set(globResult, assetContents);
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
      hash.update(assetsToAdd.get(assetPath)!);
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
        compilation.errors.push(new webpack.WebpackError(errorMessage));
        return this._renderError(errorMessage);
      }

      const assetSource: webpack.sources.RawSource = new webpack.sources.RawSource(asset);
      compilation.assets[fullAssetPath] = assetSource;
      module.buildInfo.assets[fullAssetPath] = assetSource;
    }

    return `${webpack.RuntimeGlobals.publicPath} + ${JSON.stringify(pathPrefix)}`;
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
