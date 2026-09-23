// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import dotenv from 'dotenv';

import { EnvironmentMap, FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { RushUserConfiguration } from '../api/RushUserConfiguration';
import { EnvironmentConfiguration, EnvironmentVariableNames } from '../api/EnvironmentConfiguration';
import { RushConstants } from './RushConstants';

export function initializeDotEnv(terminal: ITerminal, rushJsonFilePath: string | undefined): void {
  if (EnvironmentConfiguration.hasBeenValidated) {
    throw terminal.writeWarningLine(
      `The ${EnvironmentConfiguration.name} was initialized before .env files were loaded. Rush environment ` +
        'variables may have unexpected values.'
    );
  }

  if (rushJsonFilePath) {
    const rushJsonFolder: string = path.dirname(rushJsonFilePath);
    dotenv.config({ path: `${rushJsonFolder}/.env` });
  }

  const rushUserFolder: string = RushUserConfiguration.getRushUserFolderPath();
  dotenv.config({ path: `${rushUserFolder}/.env` });

  // TODO: Consider adding support for repo-specific `.rush-user` `.env` files.
}

/** Request-local counterpart of initializeDotEnv; encrypted vaults require the native frontend. */
export function loadDotEnvForEnvironment(
  cwd: string,
  initialEnvironment: Readonly<NodeJS.ProcessEnv>,
  rushJsonFilePath: string
): NodeJS.ProcessEnv {
  const environment: EnvironmentMap = new EnvironmentMap(initialEnvironment);
  environment.set(EnvironmentVariableNames.RUSH_INVOKED_FOLDER, cwd);
  const load = (filename: string): void => {
    if (environment.get('DOTENV_KEY')) throw new Error('Encrypted dotenv vaults require in-process Rushx.');
    const { error, parsed } = dotenv.configDotenv({ path: filename, processEnv: {} });
    if (error) {
      if (FileSystem.isNotExistError(error)) return;
      throw error;
    }
    if (!parsed) throw new Error(`Dotenv did not return parsed values for ${filename}.`);
    for (const [name, value] of Object.entries(parsed)) {
      if (environment.get(name) === undefined) environment.set(name, value);
    }
  };
  load(path.join(path.dirname(rushJsonFilePath), '.env'));
  const home: string | undefined = environment.get(process.platform === 'win32' ? 'USERPROFILE' : 'HOME');
  if (home === undefined || !FileSystem.exists(path.resolve(cwd, home))) {
    throw new Error("Unable to determine the current user's home directory");
  }
  load(path.join(path.resolve(cwd, home), RushConstants.rushUserConfigurationFolderName, '.env'));
  if (environment.get('DOTENV_KEY')) throw new Error('Encrypted dotenv vaults require in-process Rushx.');
  return environment.toObject();
}
