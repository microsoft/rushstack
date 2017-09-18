/// <reference path="./webpackTypes.d.ts" />

import * as Webpack from 'webpack';

// tslint:disable-next-line:variable-name
const ConstDependency: IConstDependency = require('webpack/lib/dependencies/ConstDependency');

export class ResolveChunkPlugin implements Webpack.Plugin {
  public apply(compiler: Webpack.Compiler): void {
    compiler.plugin('compilation', (compilation, data) => {
      const chunkIdMap: Map<string, ((id: number | undefined) => void)[]> =
        new Map<string, ((id: number | undefined) => void)[]>();

      data.normalModuleFactory.plugin('parser', (parser) => {
        parser.plugin('call resolveChunk', (expr) => {
          if (expr.arguments.length !== 1) {
            // Invalid function call. Fall through to the next plugin
            return;
          }

          const param: IParam = parser.evaluateExpression(expr.arguments[0]);
          if (param.isString()) {
            const chunkName: string = param.string;
            if (!chunkIdMap.has(chunkName)) {
              chunkIdMap.set(chunkName, []);
            }

            const state: IModule = parser.state.current;
            const addDependencyFn: ((dependency: IConstDependency) => void) = state.addDependency.bind(state);
            chunkIdMap.get(chunkName).push((id: number | undefined) => {
              const value: string = id
                ? `/*resolveChunk*/(${id} /* ${chunkName} */)`
                : `/*resolveChunk*/(undefined /* Invalid chunk name "${chunkName}" */)`;

              const dep: IConstDependency = new ConstDependency(value, expr.range);
              dep.loc = expr.loc;
              addDependencyFn(dep);
            });

            // Bail. Assume we're good.
            return true;
          }
        });
      });

      compilation.plugin('after-optimize-chunk-ids', (chunks: IChunk[]) => {
        for (const chunk of chunks) {
          if (chunkIdMap.has(chunk.name)) {
            for (const dependencyFn of chunkIdMap.get(chunk.name)) {
              dependencyFn(chunk.id);
            }

            // Clear out the map entry so we can deal with the bad ones later
            chunkIdMap.delete(chunk.name);
          }
        }

        chunkIdMap.forEach((dependencyFns: ((id: number | undefined) => void)[], chunkName: string) => {
          for (const dependencyFn of dependencyFns) {
            // Replace with an error function
            dependencyFn(undefined);
          }

          console.error(`Referenced chunk "${chunkName}" does not exist.`);
        });
      });
    });

  }
}
