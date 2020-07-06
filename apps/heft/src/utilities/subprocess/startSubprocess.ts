// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider, Terminal } from '@rushstack/node-core-library';

import { SubprocessTerminalProvider } from './SubprocessTerminalProvider';
import {
  SubprocessRunnerBase,
  ISubprocessInnerConfiguration,
  SUBPROCESS_RUNNER_CLASS_LABEL,
  SUBPROCESS_RUNNER_INNER_INVOKE
} from './SubprocessRunnerBase';

const [
  ,
  ,
  subprocessModulePath,
  serializedInnerConfiguration,
  serializedSubprocessConfiguration
] = process.argv;

const innerConfiguration: ISubprocessInnerConfiguration = JSON.parse(serializedInnerConfiguration);
const terminalProvider: ITerminalProvider = new SubprocessTerminalProvider(innerConfiguration);

const subprocessRunnerModule: object = require(subprocessModulePath);
const subprocessRunnerModuleExports: string[] = Object.getOwnPropertyNames(subprocessRunnerModule).filter(
  (exportName) => exportName !== '__esModule'
);
if (subprocessRunnerModuleExports.length !== 1) {
  throw new Error(
    `The provided subprocess module path (${subprocessModulePath}) must only have a single value exported.`
  );
}

declare class SubprocessRunnerSubclass extends SubprocessRunnerBase<object> {
  public _terminal: Terminal; // Expose the terminal object
  public filename: string;
  public invokeAsync(): Promise<void>;
}

const SubprocessRunnerClass: typeof SubprocessRunnerSubclass =
  subprocessRunnerModule[subprocessRunnerModuleExports[0]];
if (!SubprocessRunnerClass[SUBPROCESS_RUNNER_CLASS_LABEL]) {
  throw new Error(
    `The provided subprocess module path (${subprocessModulePath}) does not extend from the ` +
      'SubprocessRunnerBase class.'
  );
}

const subprocessConfiguration: object = JSON.parse(serializedSubprocessConfiguration);
const subprocessRunner: SubprocessRunnerSubclass = new SubprocessRunnerClass(
  terminalProvider,
  subprocessConfiguration
);

subprocessRunner[SUBPROCESS_RUNNER_INNER_INVOKE].call(subprocessRunner).catch((error) => {
  subprocessRunner._terminal.writeErrorLine(`Unexpected error in subprocess: ${error}`);
  process.exit(1);
});
