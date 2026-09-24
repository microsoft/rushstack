// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AgentProgressRenderer } from './AgentProgressRenderer';
import { selectClientOutputMode } from './outputSelection';

const startTimeMs: number = Date.now();
const argv: string[] = process.argv.slice(2);
const commandName: string | undefined = argv[0];
// Write the agent status line before loading @microsoft/rush-lib (hundreds of milliseconds).
const agentRenderer: AgentProgressRenderer | undefined =
  selectClientOutputMode(argv, process.env) === 'agent' &&
  commandName !== undefined &&
  !commandName.startsWith('-') &&
  commandName !== 'daemon' &&
  !process.argv.includes('--help') &&
  !process.argv.includes('-h')
    ? new AgentProgressRenderer({
        commandName,
        isTTY: !!process.stdout.isTTY && process.env.TERM !== 'dumb',
        columns: process.stdout.columns || 80,
        write: (text: string) => process.stdout.write(text),
        startTimeMs
      })
    : undefined;
agentRenderer?.start();

const { launchClientAsync } = require('./launchClient') as typeof import('./launchClient');

launchClientAsync(false, agentRenderer).catch((error: Error) => {
  agentRenderer?.dispose();
  process.stderr.write(`rush-client: ${error.message}\n`);
  process.exitCode = 1;
});
