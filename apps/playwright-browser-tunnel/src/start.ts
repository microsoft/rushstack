// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';

import { PlaywrightBrowserTunnelCommandLine } from './PlaywrightBrowserTunnelCommandLine';

const toolVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

console.log();
console.log(`Playwright Browser Tunnel ${toolVersion} - https://rushstack.io`);
console.log();

const commandLine: PlaywrightBrowserTunnelCommandLine = new PlaywrightBrowserTunnelCommandLine();
commandLine
  .executeAsync()
  .catch((error) => {
    console.error(error);
  })
  .finally(() => {
    console.log('Command execution completed');
  });
