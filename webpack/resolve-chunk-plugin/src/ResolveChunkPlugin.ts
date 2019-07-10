// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference path="../typings/tsd.d.ts" />

import * as Webpack from 'webpack';

// tslint:disable:variable-name
const ConstDependency: IConstDependency = require('webpack/lib/dependencies/ConstDependency');
const ParserHelpers: IParserHelper = require('webpack/lib/ParserHelpers');
// tslint:enable:variable-name

const EXPRESSION_NAME: string = 'resolveChunk';
const PLUGIN_NAME: string = 'resolve-chunk-plugin';

type ChunkId = number | string | undefined;

/**
 * See README for documentation on this plugin.
 *
 * @public
 */
export class ResolveChunkPlugin implements Webpack.Plugin {
  private _chunkIdMap: Map<string, ((id: ChunkId) => void)[]> = new Map<string, ((id: ChunkId) => void)[]>();

  /**
   * Apply the plugin to the compilation.
   */
  public apply(compiler: Webpack.Compiler): void {
    const isWebpack4: boolean = !!compiler.hooks;

    if (isWebpack4) {
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation, { normalModuleFactory }) => {
        const handler: (parser: IParser) => void = (parser: IParser) => {
          parser.hooks.call.for(EXPRESSION_NAME).tap(PLUGIN_NAME, expression => {
            this._resolveChunkCalled(parser, expression);
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

        compilation.hooks.afterOptimizeChunkIds.tap(PLUGIN_NAME, this._afterOptimizeChunkIds.bind(this));
      });
    } else {
      compiler.plugin('compilation', (compilation, data) => {
        data.normalModuleFactory.plugin('parser', factory => {
          factory.plugin(`call ${EXPRESSION_NAME}`, expr => this._resolveChunkCalled(factory, expr));
        });

        compilation.plugin('after-optimize-chunk-ids', (chunks: IV3Chunk[]) =>
          this._afterOptimizeChunkIds.bind(this)
        );
      });
    }
  }

  private _resolveChunkCalled(parser: IParser, expression: IExpression): boolean | undefined {
    if (expression.arguments.length !== 1) {
      // Invalid function call. Fall through to the next plugin
      return;
    }

    const param: IParam = parser.evaluateExpression(expression.arguments[0]);
    if (param.isString()) {
      const chunkName: string = param.string;
      if (!this._chunkIdMap.has(chunkName)) {
        this._chunkIdMap.set(chunkName, []);
      }

      const state: IModule = parser.state.current;
      const addDependencyFn: (dependency: IConstDependency) => void = state.addDependency.bind(state);
      (this._chunkIdMap.get(chunkName) || []).push((id: ChunkId) => {
        let value: string;
        if (id) {
          const normalizedId: string | number = typeof id === 'number' ? id : `"${id}"`;
          value = `/*resolveChunk*/(${normalizedId} /* ${chunkName} */)`;
        } else {
          value = `/*resolveChunk*/(undefined /* Invalid chunk name '${chunkName}' */)`;
        }

        const dep: IConstDependency = new ConstDependency(value, expression.range, false);
        dep.loc = expression.loc;
        addDependencyFn(dep);
      });

      // Bail. Assume we're good.
      return true;
    }
  }

  private _afterOptimizeChunkIds(chunks: Webpack.compilation.Chunk[]): void {
    for (const chunk of chunks) {
      if (this._chunkIdMap.has(chunk.name)) {
        for (const dependencyFn of this._chunkIdMap.get(chunk.name) || []) {
          dependencyFn(chunk.id);
        }

        // Clear out the map entry so we can deal with the bad ones later
        this._chunkIdMap.delete(chunk.name);
      }
    }

    this._chunkIdMap.forEach((dependencyFns: ((id: ChunkId) => void)[], chunkName: string) => {
      for (const dependencyFn of dependencyFns) {
        // Replace with an error function
        dependencyFn(undefined);
      }

      console.error(`Referenced chunk '${chunkName}' does not exist.`);
    });
  }
}
