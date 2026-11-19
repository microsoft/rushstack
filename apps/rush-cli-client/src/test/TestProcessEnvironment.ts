// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CLIENT_OUTPUT_SELECTION_ENV_VARS } from '../outputSelection';

/**
 * Returns a copy of `base` (by default `process.env`) for the clients that tests spawn, without the variables
 * that select the client's output mode (`RUSHD_OUTPUT` and agent markers such as `COPILOT_CLI`). Spawned
 * clients then use the default output even when the tests run in an agent's shell. Tests of agent output set
 * those variables explicitly.
 */
export function getTestProcessEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...base };
  for (const name of CLIENT_OUTPUT_SELECTION_ENV_VARS) {
    delete environment[name];
  }
  return environment;
}
