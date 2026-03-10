// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import dotenv from 'dotenv';

import type { ITerminal } from '@rushstack/terminal';

import { RushUserConfiguration } from '../api/RushUserConfiguration.ts';
import { EnvironmentConfiguration } from '../api/EnvironmentConfiguration.ts';

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
