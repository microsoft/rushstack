// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import webpack from 'webpack';
import type { Compiler, OutputFileSystem, Stats } from 'webpack';
import { Volume } from 'memfs';
import type { ILoadThemedStylesLoaderOptions } from '../../index.js';

// webpack5-loader-load-themed-styles/lib/LoadThemedStylesLoader.js
const LOADER_PATH: string = path.resolve(__dirname, '../../index.js');

export default function getCompiler(
  fixture: string,
  options: ILoadThemedStylesLoaderOptions = {}
): Promise<Stats | undefined> {
  const compiler: Compiler = webpack({
    context: __dirname,
    entry: `./${fixture}`,
    output: {
      path: path.resolve(__dirname),
      filename: 'bundle.js'
    },
    mode: 'none',
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [
            {
              loader: LOADER_PATH,
              options: options
            },
            {
              loader: 'css-loader',
              options: {
                modules: true
              }
            }
          ]
        }
      ]
    }
  });

  compiler.outputFileSystem = new Volume() as unknown as OutputFileSystem;
  compiler.outputFileSystem.join = path.join.bind(path);

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) reject(err);
      if (stats?.hasErrors()) reject(stats?.toJson().errors);

      resolve(stats);
    });
  });
}
