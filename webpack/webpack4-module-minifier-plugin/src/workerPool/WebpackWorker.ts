// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as workerThreads from 'node:worker_threads';

import webpack = require('webpack');

import { MessagePortMinifier } from '@rushstack/module-minifier';

import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin';
import '../OverrideWebpackIdentifierAllocation';

// Hack to support mkdirp on node 10
process.umask = () => 0;

const { configFilePath, sourceMap, usePortableModules } = workerThreads.workerData;

const webpackConfigs: webpack.Configuration[] = require(configFilePath);

// chalk.enabled = enableColor;

const minifier: MessagePortMinifier = new MessagePortMinifier(workerThreads.parentPort!);

async function processTaskAsync(index: number): Promise<void> {
  const config: webpack.Configuration = webpackConfigs[index];
  // eslint-disable-next-line no-console
  console.log(`Compiling config: ${config.name || (config.output && config.output.filename)}`);

  const optimization: webpack.Options.Optimization = config.optimization || (config.optimization = {});
  const { minimizer } = optimization;

  if (minimizer) {
    for (const plugin of minimizer) {
      if (plugin instanceof ModuleMinifierPlugin) {
        plugin.minifier = minifier;
      }
    }
  } else {
    const { devtool, mode } = config;

    const finalSourceMap: boolean =
      typeof sourceMap === 'boolean'
        ? sourceMap
        : typeof devtool === 'string'
          ? devtool.endsWith('source-map') && !devtool.includes('eval')
          : devtool !== false && mode === 'production';

    optimization.minimizer = [
      new ModuleMinifierPlugin({
        minifier,
        usePortableModules,
        sourceMap: finalSourceMap
      })
    ];
  }

  await new Promise<void>((resolve: () => void, reject: (err: Error) => void) => {
    const compiler: webpack.Compiler = webpack(config);
    compiler.run(async (err: Error | undefined, stats: webpack.Stats) => {
      if (err) {
        return reject(err);
      }

      if (stats && stats.hasErrors()) {
        const errorStats: webpack.Stats.ToJsonOutput = stats.toJson('errors-only');

        errorStats.errors.forEach((error) => {
          // eslint-disable-next-line no-console
          console.error(error);
        });

        return reject(new Error(`Webpack failed with ${errorStats.errors.length} error(s).`));
      }

      resolve();
    });
  });
}

process.exitCode = 3;

workerThreads.parentPort!.on('message', (message: number | false | object) => {
  // Termination request
  if (message === false) {
    process.exit(0);
  }

  // Input for the MessagePortMinifier
  if (typeof message === 'object') {
    return;
  }

  const index: number = message as number;

  processTaskAsync(index).then(
    () => {
      workerThreads.parentPort!.postMessage(index);
    },
    (err: Error) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    }
  );
});
