// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable */

const EventEmitter = require('node:events');

const childProcess: any = jest.genMockFromModule('node:child_process');
const childProcessActual = jest.requireActual('node:child_process');
childProcess.spawn.mockImplementation(spawn);
childProcess.__setSpawnMockConfig = setSpawnMockConfig;

let spawnMockConfig = normalizeSpawnMockConfig();

/**
 * Helper to initialize how the `spawn` mock should behave.
 */
function normalizeSpawnMockConfig(maybeConfig?: any) {
  const config = maybeConfig || {};
  return {
    emitError: typeof config.emitError !== 'undefined' ? config.emitError : false,
    returnCode: typeof config.returnCode !== 'undefined' ? config.returnCode : 0
  };
}

/**
 * Initialize the `spawn` mock behavior.
 *
 * Not a pure function.
 */
function setSpawnMockConfig(spawnConfig: any) {
  spawnMockConfig = normalizeSpawnMockConfig(spawnConfig);
}

/**
 * Mock of `spawn`.
 */
function spawn(file: string, args: string[], options: {}) {
  const cpMock = new childProcess.ChildProcess();

  // Add working event emitters ourselves since `genMockFromModule` does not add them because they
  // are dynamically added by `spawn`.
  const cpEmitter = new EventEmitter();
  const cp = Object.assign({}, cpMock, {
    stdin: new EventEmitter(),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    on: cpEmitter.on,
    emit: cpEmitter.emit
  });

  setTimeout(() => {
    cp.stdout.emit('data', `${file} ${args}: Mock task is spawned`);

    if (spawnMockConfig.emitError) {
      cp.stderr.emit('data', `${file} ${args}: A mock error occurred in the task`);
    }

    cp.emit('close', spawnMockConfig.returnCode);
  }, 0);

  return cp;
}

/**
 * Ensure the real spawnSync function is used, otherwise LockFile breaks.
 */
childProcess.spawnSync = childProcessActual.spawnSync;

module.exports = childProcess;
