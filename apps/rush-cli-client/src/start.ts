// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AgentProgressRenderer } from './AgentProgressRenderer';
import { ClientOutput } from './clientOutput';
import { isDaemonOffBeforeRouting } from './earlyRouting';
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
// Until Rush runs in-process, a reader of the output that exits (for example `| head`) cancels the command instead
// of failing the process.
const output: ClientOutput = new ClientOutput();
output.guard();
// Write the agent status line before loading @microsoft/rush-lib (hundreds of milliseconds).
const agentRenderer: AgentProgressRenderer | undefined =
  selectClientOutputMode({
    argv,
    environment: process.env,
    useRushReporter: !!rushJsonPath && readUseRushReporter(rushJsonPath)
  }) === 'agent' && commandName !== undefined
    ? new AgentProgressRenderer({
        commandName,
        // A pty without a size (e.g. `script` run without a terminal) cannot be repainted; treat it as a pipe.
        isTTY: !!process.stdout.isTTY && process.env.TERM !== 'dumb' && !!process.stdout.columns,
        columns: process.stdout.columns || 80,
        write: (text: string) => output.stdout.write(text),
        startTimeMs
      })
    : undefined;
// A command that runs in-process shows no progress. When routing sends it to the daemon, launchClient starts this.
if (agentRenderer && !isDaemonOffBeforeRouting(process.env, rushJsonPath)) {
  agentRenderer.start();
}

const { launchClientAsync } = require('./launchClient') as typeof import('./launchClient');

launchClientAsync(false, agentRenderer, output).catch((error: Error) => {
  // In agent mode the summary line may already carry the complete message; do not repeat it.
  if (!agentRenderer?.finish({ exitCode: 1, errorMessage: error.message })) {
    process.stderr.write(`rush-client: ${error.message}\n`);
  }
  process.exitCode = 1;
});
