// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { RushConfiguration } from '@microsoft/rush-lib';

import { TestWorkspaceSession } from './TestWorkspaceSession';

/** Creates an empty Rush repository in the folder, and returns its common/temp folder. */
export function createTemporaryRepo(repoRoot: string): string {
  const commonTempFolder: string = path.join(repoRoot, 'common', 'temp');
  fs.mkdirSync(path.join(repoRoot, 'common', 'config', 'rush'), { recursive: true });
  fs.mkdirSync(commonTempFolder, { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'rush.json'),
    JSON.stringify({ rushVersion: '5.178.1', pnpmVersion: '8.14.0', projects: [] })
  );
  return commonTempFolder;
}

/** A workspace in a repository of its own, from {@link createTemporaryRepo}, whose lock a test can hold. */
export class TemporaryRepoWorkspaceSession extends TestWorkspaceSession {
  public override readonly rushConfiguration: RushConfiguration;

  public constructor(repoRoot: string) {
    super(repoRoot);
    this.rushConfiguration = RushConfiguration.loadFromConfigurationFile(path.join(repoRoot, 'rush.json'));
  }
}
