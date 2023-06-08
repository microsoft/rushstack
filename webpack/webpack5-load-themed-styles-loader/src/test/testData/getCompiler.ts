import path from 'path';
import webpack from 'webpack';
import type { Compiler, Stats } from 'webpack';
import { createFsFromVolume, Volume } from 'memfs';
import { ILoadThemedStylesLoaderOptions } from '../..';

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

  compiler.outputFileSystem = createFsFromVolume(new Volume());
  compiler.outputFileSystem.join = path.join.bind(path);

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) reject(err);
      if (stats?.hasErrors()) reject(stats?.toJson().errors);

      resolve(stats);
    });
  });
}
