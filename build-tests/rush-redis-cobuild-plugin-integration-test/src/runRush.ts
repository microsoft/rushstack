// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushCommandLineParser } from '@microsoft/rush-lib/lib/cli/RushCommandLineParser';
import * as rushLib from '@microsoft/rush-lib';

// Setup redis cobuild plugin
const builtInPluginConfigurations: rushLib._IBuiltInPluginConfiguration[] = [];

const rushConfiguration: rushLib.RushConfiguration = rushLib.RushConfiguration.loadFromDefaultLocation({
  startingFolder: __dirname
});
const project: rushLib.RushConfigurationProject | undefined = rushConfiguration.getProjectByName(
  '@rushstack/rush-redis-cobuild-plugin'
);
if (!project) {
  throw new Error('Project @rushstack/rush-redis-cobuild-plugin not found');
}
builtInPluginConfigurations.push({
  packageName: '@rushstack/rush-redis-cobuild-plugin',
  pluginName: 'rush-redis-cobuild-plugin',
  pluginPackageFolder: project.projectFolder
});

async function rushRush(args: string[]): Promise<void> {
  const options: rushLib.ILaunchOptions = {
    isManaged: false,
    alreadyReportedNodeTooNewError: false,
    builtInPluginConfigurations
  };
  const parser: RushCommandLineParser = new RushCommandLineParser({
    alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError,
    builtInPluginConfigurations: options.builtInPluginConfigurations
  });
  // eslint-disable-next-line no-console
  console.log(`Executing: rush ${args.join(' ')}`);
  await parser
    .executeAsync(args)
    // eslint-disable-next-line no-console
    .catch(console.error); // CommandLineParser.executeAsync() should never reject the promise
}

// eslint-disable-next-line no-console
rushRush(process.argv.slice(2)).catch(console.error);
