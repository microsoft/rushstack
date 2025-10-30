// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import {
  tunneledBrowserConnection,
  type IDisposableTunneledBrowserConnection
} from './tunneledBrowserConnection';

const { program } = require('playwright-core/lib/utilsBundle');
const { decorateCommand } = require('playwright/lib/mcp/program');

async function executeAsync(): Promise<boolean> {
  using connection: IDisposableTunneledBrowserConnection = await tunneledBrowserConnection();
  const { remoteEndpoint } = connection;

  const tempdir: string = tmpdir();
  const configPath: string = `${tempdir}/playwright-mcp-config.${randomUUID()}.json`;

  writeFileSync(
    configPath,
    JSON.stringify({ browser: { remoteEndpoint, launchOptions: { headless: false } } })
  );

  const playwrightVersion: string = require('playwright/package.json').version;
  const p: unknown = program.version('Version ' + playwrightVersion).name('Playwright MCP');
  decorateCommand(p, playwrightVersion);
  void program.parseAsync([...process.argv, '--config', configPath]);

  return true;
}

executeAsync().catch((error) => {
  console.error(`The Playwright MCP command failed: ${error}`);
  process.exitCode = 1;
});
