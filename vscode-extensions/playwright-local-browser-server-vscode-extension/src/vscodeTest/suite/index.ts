// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as assert from 'node:assert';

import * as vscode from 'vscode';

const EXTENSION_ID: string = 'ms-RushStack.playwright-local-browser-server';
const COMMAND_START_TUNNEL: string = 'playwright-local-browser-server.start';
const COMMAND_STOP_TUNNEL: string = 'playwright-local-browser-server.stop';

function sleepAsync(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function promiseSettledWithinAsync(promise: Thenable<unknown>, milliseconds: number): Promise<boolean> {
  let settled: boolean = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await sleepAsync(milliseconds);
  return settled;
}

export async function run(): Promise<void> {
  const extension: vscode.Extension<unknown> | undefined = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Expected ${EXTENSION_ID} to be installed in the VS Code test host.`);

  await extension.activate();

  const commands: string[] = await vscode.commands.getCommands(true);
  assert.ok(commands.includes(COMMAND_START_TUNNEL), `Missing command: ${COMMAND_START_TUNNEL}`);
  assert.ok(commands.includes(COMMAND_STOP_TUNNEL), `Missing command: ${COMMAND_STOP_TUNNEL}`);

  await vscode.workspace
    .getConfiguration('playwright-local-browser-server')
    .update('autoStart', true, vscode.ConfigurationTarget.Global);

  await vscode.commands.executeCommand(COMMAND_START_TUNNEL, true);
  await sleepAsync(250);

  const stopPromise: Thenable<unknown> = vscode.commands.executeCommand(COMMAND_STOP_TUNNEL);
  await sleepAsync(250);

  const restartPromise: Thenable<unknown> = vscode.commands.executeCommand(COMMAND_START_TUNNEL, true);

  assert.strictEqual(
    await promiseSettledWithinAsync(restartPromise, 1000),
    false,
    'Start resolved while the previous Stop command was still pending.'
  );

  assert.strictEqual(
    await promiseSettledWithinAsync(stopPromise, 1),
    false,
    'Stop unexpectedly settled before the restart guard could be observed.'
  );

  // eslint-disable-next-line no-console
  console.log('Playwright tunnel restart remained pending behind the in-progress stop.');
}
