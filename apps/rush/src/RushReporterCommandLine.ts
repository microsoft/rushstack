// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { RushConfiguration } from '@microsoft/rush-lib';
import { CommandLineConfiguration, type Command } from '@microsoft/rush-lib/lib/api/CommandLineConfiguration';
import { RushConstants } from '@microsoft/rush-lib/lib/logic/RushConstants';
import { RushPluginsConfiguration } from '@microsoft/rush-lib/lib/api/RushPluginsConfiguration';

export interface IReporterCommandLineOwnership {
  readonly known: boolean;
  readonly parameters: ReadonlySet<string>;
}

const NATIVE_COMMANDS: ReadonlySet<string> = new Set([
  'add',
  'alert',
  'bridge-package',
  'change',
  'check',
  'deploy',
  'init',
  'init-autoinstaller',
  'init-deploy',
  'init-subspace',
  'install',
  'install-autoinstaller',
  'link',
  'link-package',
  'list',
  'publish',
  'purge',
  'remove',
  'scan',
  'setup',
  'unlink',
  'update',
  'update-autoinstaller',
  'update-cloud-credentials',
  'upgrade-interactive',
  'version'
]);

export function getReporterCommandLineOwnership(
  actionName: string | undefined,
  cwd: string
): IReporterCommandLineOwnership {
  const parameters: Set<string> = new Set();
  if (!actionName) {
    return { known: false, parameters };
  }
  if (NATIVE_COMMANDS.has(actionName)) {
    if (actionName === 'check') {
      parameters.add('--verbose');
    }
    return { known: true, parameters };
  }

  const rushJsonPath: string | undefined = RushConfiguration.tryFindRushJsonLocation({
    startingFolder: cwd,
    showVerbose: false
  });
  const configFolder: string | undefined = rushJsonPath
    ? path.join(path.dirname(rushJsonPath), RushConstants.commonFolderName, 'config', 'rush')
    : undefined;
  if (
    configFolder &&
    new RushPluginsConfiguration(path.join(configFolder, 'rush-plugins.json')).configuration.plugins.length >
      0
  ) {
    // The selected engine resolves plugin command definitions; do not claim their parameters here.
    return { known: false, parameters };
  }

  const configuration: CommandLineConfiguration = CommandLineConfiguration.loadFromFileOrDefault(
    configFolder && path.join(configFolder, RushConstants.commandLineFilename)
  );
  const command: Command | undefined = configuration.commands.get(actionName);
  if (!command) {
    return { known: false, parameters };
  }
  for (const parameter of command.associatedParameters) {
    parameters.add(parameter.longName);
  }
  if (command.commandKind === RushConstants.phasedCommandKind) {
    parameters.add('--verbose');
  }
  return { known: true, parameters };
}
