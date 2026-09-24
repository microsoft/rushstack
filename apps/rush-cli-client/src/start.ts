// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AgentProgressRenderer } from './AgentProgressRenderer';
import {
  findRushJsonPath,
  getAgentCommandName,
  readUseRushReporter,
  selectClientOutputMode
} from './outputSelection';

const startTimeMs: number = Date.now();
const argv: string[] = process.argv.slice(2);
const commandName: string | undefined = getAgentCommandName(argv);
const rushJsonPath: string | undefined = findRushJsonPath(process.cwd());
// Write the agent status line before loading @microsoft/rush-lib (hundreds of milliseconds).
const agentRenderer: AgentProgressRenderer | undefined =
  selectClientOutputMode({
    argv,
    environment: process.env,
    useRushReporter: !!rushJsonPath && readUseRushReporter(rushJsonPath)
  }) === 'agent' &&
  commandName !== undefined
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
  agentRenderer?.finish({ exitCode: 1, errorMessage: error.message });
  process.stderr.write(`rush-client: ${error.message}\n`);
  process.exitCode = 1;
});
