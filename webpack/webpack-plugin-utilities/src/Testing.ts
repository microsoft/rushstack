import { createFsFromVolume, Volume } from 'memfs';
import path from 'path';
import webpack from 'webpack';
import webpackMerge from 'webpack-merge';

import type { MultiStats, Stats, Configuration, Compiler } from 'webpack';

/**
 * @alpha
 * @description - This function generates a webpack compiler with default configuration and the output filesystem mapped to
 * a memory filesystem. This is useful for testing webpack plugins/loaders where we do not need to write to disk (which can be costly).
 * @param entry - The entry point for the webpack compiler
 * @param additionalConfig - Any additional configuration that should be merged with the default configuration
 * @public
 * @returns - A webpack compiler with the output filesystem mapped to a memory filesystem
 */
export async function getTestingWebpackCompiler(
  entry: string,
  additionalConfig: Configuration = {}
): Promise<(Stats | MultiStats) | undefined> {
  const compilerOptions: Configuration = webpackMerge(_defaultWebpackConfig(entry), additionalConfig);
  const compiler: Compiler = webpack(compilerOptions);

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

function _defaultWebpackConfig(entry: string = './src'): Configuration {
  return {
    // We don't want to have eval source maps, nor minification
    // so we set mode to 'none' to disable both. Default is 'production'
    mode: 'none',
    context: __dirname,
    entry,
    output: {
      path: path.resolve(__dirname),
      filename: 'test-bundle.js'
    }
  };
}
