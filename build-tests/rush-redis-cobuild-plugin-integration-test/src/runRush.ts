// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Import from lib-commonjs for easy debugging
import { RushCommandLineParser } from '@microsoft/rush-lib/lib-commonjs/cli/RushCommandLineParser';
import * as rushLib from '@microsoft/rush-lib/lib-commonjs';

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
  console.log(`Executing: rush ${args.join(' ')}`);
  await parser.execute(args).catch(console.error); // CommandLineParser.execute() should never reject the promise
}

rushRush(process.argv.slice(2)).catch(console.error);
