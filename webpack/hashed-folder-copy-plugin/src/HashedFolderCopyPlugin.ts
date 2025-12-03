// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CallExpression, Expression, UnaryExpression } from 'estree';
import type webpack from 'webpack';
import type glob from 'fast-glob';

import { Async } from '@rushstack/node-core-library';

import {
  type IHashedFolderDependency,
  getHashedFolderDependencyForWebpackInstance
} from './HashedFolderDependency';
import type { BasicEvaluatedExpression } from './webpackTypes';

interface IParserHelpers {
  evaluateToString: (type: string) => (exp: UnaryExpression) => BasicEvaluatedExpression;
  toConstantDependency: (parser: webpack.Parser, type: string) => (exp: Expression) => true;
}

// TODO: Use the compiler's webpack exports instead of requiring from webpack
const ParserHelpers: IParserHelpers = require('webpack/lib/javascript/JavascriptParserHelpers');

const PLUGIN_NAME: 'hashed-folder-copy-plugin' = 'hashed-folder-copy-plugin';

const EXPRESSION_NAME: 'requireFolder' = 'requireFolder';

interface IAcornNode<TExpression> {
  computed: boolean | undefined;
  elements: IAcornNode<unknown>[];
  key: IAcornNode<unknown> | undefined;
  name: string | undefined;
  properties: IAcornNode<unknown>[] | undefined;
  type: 'Literal' | 'ObjectExpression' | 'Identifier' | 'ArrayExpression' | unknown;
  value: TExpression;
}

export function renderError(errorMessage: string): string {
  return `(function () { throw new Error(${JSON.stringify(errorMessage)}); })()`;
}

/**
 * @public
 */
export class HashedFolderCopyPlugin implements webpack.WebpackPluginInstance {
  public apply(compiler: webpack.Compiler): void {
    const webpack: typeof import('webpack') = compiler.webpack;
    const { HashedFolderDependency, HashedFolderDependencyTemplate } =
      getHashedFolderDependencyForWebpackInstance(webpack);

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation: webpack.Compilation) => {
      compilation.dependencyTemplates.set(HashedFolderDependency, new HashedFolderDependencyTemplate());
    });

    const hashedFolderDependencies: IHashedFolderDependency[] = [];

    compiler.hooks.thisCompilation.tap(
      PLUGIN_NAME,
      (compilation: webpack.Compilation, { normalModuleFactory }) => {
        compilation.hooks.finishModules.tapPromise(PLUGIN_NAME, async () => {
          const { inputFileSystem } = compiler;

          const notImplementedFunction: () => never = () => {
            throw new Error('Not implemented');
          };
          const globFs: glob.FileSystemAdapter = {
            lstat: inputFileSystem?.lstat?.bind(inputFileSystem) ?? notImplementedFunction,
            stat: inputFileSystem?.stat?.bind(inputFileSystem) ?? notImplementedFunction,
            lstatSync: notImplementedFunction,
            statSync: notImplementedFunction,
            readdir: inputFileSystem?.readdir?.bind(inputFileSystem) ?? notImplementedFunction,
            readdirSync: notImplementedFunction
          } as unknown as glob.FileSystemAdapter; // The Webpack typings are wrong on `readdir`

          await Async.forEachAsync(
            hashedFolderDependencies,
            async (hashedFolderDependency) => {
              await hashedFolderDependency.processAssetsAsync(compilation, globFs);
            },
            { concurrency: 10 }
          );
        });

        const handler: (parser: webpack.javascript.JavascriptParser) => void = (
          parser: webpack.javascript.JavascriptParser
        ) => {
          parser.hooks.call.for(EXPRESSION_NAME).tap(PLUGIN_NAME, (baseExpression: Expression) => {
            const expression: CallExpression = baseExpression as CallExpression;

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
                      source.globPatterns.some(
                        (globPattern) => !globPattern || typeof globPattern !== 'string'
                      )
                    ) {
                      errorMessage =
                        'Each "sources" element must have a "globPatterns" property that is an array of glob strings';
                    }
                  }
                }
              }
            }

            const currentModule: webpack.NormalModule = parser.state.current;
            let dependency: webpack.dependencies.NullDependency;
            if (!requireFolderOptions) {
              const errorText: string = renderError(errorMessage!);
              dependency = new webpack.dependencies.ConstDependency(errorText, expression.range!);
              if (expression.loc) {
                dependency.loc = expression.loc;
              }

              compilation.errors.push(new webpack.WebpackError(errorMessage));
            } else {
              const hashedFolderDependency: IHashedFolderDependency = new HashedFolderDependency(
                requireFolderOptions,
                expression.range!,
                expression.loc
              );
              hashedFolderDependencies.push(hashedFolderDependency);
              dependency = hashedFolderDependency;
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
      }
    );
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
