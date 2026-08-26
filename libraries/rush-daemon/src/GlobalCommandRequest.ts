// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { EnvironmentMap } from '@rushstack/node-core-library';

import type { IWorkspaceSession } from './WorkspaceSession';

/**
 * Terminal properties captured from the client that submitted a global command.
 *
 * @beta
 */
export interface IGlobalCommandTerminalProperties {
  readonly columns: number | undefined;
  readonly isTTY: boolean;
  readonly supportsColor: boolean;
}

/**
 * An immutable process-environment snapshot.
 *
 * @beta
 */
export interface IGlobalCommandEnvironment {
  get(name: string): string | undefined;
  getNames(): ReadonlyArray<string>;
  toObject(): NodeJS.ProcessEnv;
}

/**
 * Untrusted values supplied by a command integration before global-command execution.
 *
 * @beta
 */
export interface IResolveGlobalCommandRequestOptions {
  readonly commandName: string;
  readonly cwd: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly requestId: string;
  readonly terminal: IGlobalCommandTerminalProperties;
}

/**
 * A validated request that is safe to execute against one warm workspace session.
 *
 * @beta
 */
export interface IResolvedGlobalCommandRequest {
  readonly commandName: string;
  readonly cwd: string;
  readonly environment: IGlobalCommandEnvironment;
  readonly requestId: string;
  readonly terminal: IGlobalCommandTerminalProperties;
}

const REQUEST_SESSION_BY_REQUEST: WeakMap<IResolvedGlobalCommandRequest, IWorkspaceSession> = new WeakMap();

class GlobalCommandEnvironment implements IGlobalCommandEnvironment {
  readonly #environmentMap: EnvironmentMap;
  readonly #names: ReadonlyArray<string>;

  public constructor(environment: Readonly<NodeJS.ProcessEnv>) {
    this.#environmentMap = createEnvironmentMap(environment);
    this.#names = Object.freeze(
      Array.from(this.#environmentMap.entries(), ({ name }) => name).sort(compareEnvironmentNames)
    );
    Object.freeze(this);
  }

  public get(name: string): string | undefined {
    return this.#environmentMap.get(name);
  }

  public getNames(): ReadonlyArray<string> {
    return this.#names;
  }

  public toObject(): NodeJS.ProcessEnv {
    return this.#environmentMap.toObject();
  }
}

export function resolveGlobalCommandRequest(
  options: IResolveGlobalCommandRequestOptions,
  workspaceSession: IWorkspaceSession
): IResolvedGlobalCommandRequest {
  validateNonemptyName(options.requestId, 'request id');
  validateNonemptyName(options.commandName, 'command name');
  const repoRoot: string = getCanonicalDirectory(workspaceSession.metadata.repoRoot, 'workspace root');
  const cwd: string = getCanonicalDirectory(options.cwd, 'working directory');
  validatePathWithinWorkspace(cwd, repoRoot);
  const request: IResolvedGlobalCommandRequest = Object.freeze({
    commandName: options.commandName,
    cwd,
    environment: new GlobalCommandEnvironment(options.environment),
    requestId: options.requestId,
    terminal: resolveTerminalProperties(options.terminal)
  });
  REQUEST_SESSION_BY_REQUEST.set(request, workspaceSession);
  return request;
}

export function validateResolvedGlobalCommandRequest(
  request: IResolvedGlobalCommandRequest,
  workspaceSession: IWorkspaceSession
): void {
  if (REQUEST_SESSION_BY_REQUEST.get(request) !== workspaceSession) {
    throw new Error('The global command request was not resolved for this workspace session.');
  }
}

export function createGlobalCommandEnvironment(
  baseEnvironment: IGlobalCommandEnvironment,
  overlay: Readonly<NodeJS.ProcessEnv> | undefined
): NodeJS.ProcessEnv {
  const environmentMap: EnvironmentMap = new EnvironmentMap(baseEnvironment.toObject());
  if (overlay) {
    for (const [name, value] of Object.entries(overlay)) {
      validateEnvironmentName(name);
      if (value === undefined) {
        environmentMap.unset(name);
      } else {
        validateEnvironmentValue(name, value);
        environmentMap.set(name, value);
      }
    }
  }
  return environmentMap.toObject();
}

function createEnvironmentMap(environment: Readonly<NodeJS.ProcessEnv>): EnvironmentMap {
  const environmentMap: EnvironmentMap = new EnvironmentMap();
  for (const [name, value] of Object.entries(environment)) {
    validateEnvironmentName(name);
    if (value !== undefined) {
      validateEnvironmentValue(name, value);
      environmentMap.set(name, value);
    }
  }
  return environmentMap;
}

function validateEnvironmentName(name: string): void {
  if (name.length === 0 || name.includes('=') || name.includes('\0')) {
    throw new Error(`Invalid global command environment variable name: "${name}".`);
  }
}

function validateEnvironmentValue(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`The global command environment variable "${name}" must have a string value.`);
  }
  if (value.includes('\0')) {
    throw new Error(`The global command environment variable "${name}" contains a null character.`);
  }
}

function resolveTerminalProperties(
  terminal: IGlobalCommandTerminalProperties
): IGlobalCommandTerminalProperties {
  if (
    terminal.columns !== undefined &&
    (!Number.isSafeInteger(terminal.columns) || terminal.columns <= 0)
  ) {
    throw new Error('Global command terminal columns must be a positive safe integer.');
  }
  if (typeof terminal.isTTY !== 'boolean' || typeof terminal.supportsColor !== 'boolean') {
    throw new Error('Global command terminal TTY and color properties must be boolean values.');
  }
  return Object.freeze({
    columns: terminal.columns,
    isTTY: terminal.isTTY,
    supportsColor: terminal.supportsColor
  });
}

function getCanonicalDirectory(folderPath: string, kind: string): string {
  let canonicalPath: string;
  try {
    canonicalPath = fs.realpathSync.native(path.resolve(folderPath));
  } catch (error) {
    throw new Error(`The global command ${kind} does not resolve to an existing directory: ${folderPath}`, {
      cause: error
    });
  }
  if (!fs.statSync(canonicalPath).isDirectory()) {
    throw new Error(`The global command ${kind} is not a directory: ${folderPath}`);
  }
  return canonicalPath;
}

function validatePathWithinWorkspace(cwd: string, repoRoot: string): void {
  const relativePath: string = path.relative(repoRoot, cwd);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`The global command working directory is outside the daemon workspace: ${cwd}`);
  }
}

function validateNonemptyName(value: string, kind: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`Invalid global command ${kind}: "${value}".`);
  }
}

function compareEnvironmentNames(left: string, right: string): number {
  return left.localeCompare(right);
}
