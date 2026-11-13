// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { NapiCliBuildOptions } from './shared';
import napiRsPackageJson from '@napi-rs/cli/package.json';

/**
 * Worker script that runs NAPI-RS build in a separate process to prevent stderr
 * from being seen by Rush as warnings.
 */
async function runNapiRsBuild(): Promise<void> {
  try {
    console.log(`Using NAPI-RS version ${napiRsPackageJson.version}`);
    // Get the configuration from command line arguments
    const configJson = process.argv[2];
    if (!configJson) {
      throw new Error('Configuration not provided');
    }

    const config: NapiCliBuildOptions = JSON.parse(configJson);

    const { NapiCli } = await import('@napi-rs/cli');
    const cli = new NapiCli();
    const { task, abort } = await cli.build(config);

    // Handle termination signals
    const handleSignal = (): void => {
      abort();
      process.exit(1);
    };
    process.on('SIGTERM', handleSignal);
    process.on('SIGINT', handleSignal);

    await task;
    process.exit(0);
  } catch (error) {
    console.error('NAPI-RS build failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

runNapiRsBuild().catch((error) => {
  console.error('Unexpected error in NAPI-RS build worker:', error);
  process.exit(1);
});
