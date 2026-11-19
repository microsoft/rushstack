// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRushCommandOrigin } from '@rushstack/rush-daemon-protocol';

import { RequestExclusivityClass } from './RequestScheduler';

export interface IRushCommandClassificationOptions {
  readonly commandName: string;
  readonly commandOrigin?: DaemonRushCommandOrigin;
}

/**
 * Admission classifications for every command that `RushCommandLineParser` registers without repository config.
 *
 * @beta
 */
export const BUILT_IN_RUSH_COMMAND_CLASSIFICATION: Readonly<Record<string, RequestExclusivityClass>> =
  Object.freeze({
    add: RequestExclusivityClass.Exclusive,
    alert: RequestExclusivityClass.Exclusive,
    'bridge-package': RequestExclusivityClass.Exclusive,
    build: RequestExclusivityClass.SharedBuild,
    change: RequestExclusivityClass.Exclusive,
    check: RequestExclusivityClass.SharedRead,
    deploy: RequestExclusivityClass.Exclusive,
    init: RequestExclusivityClass.Exclusive,
    'init-autoinstaller': RequestExclusivityClass.Exclusive,
    'init-deploy': RequestExclusivityClass.Exclusive,
    'init-subspace': RequestExclusivityClass.Exclusive,
    install: RequestExclusivityClass.Exclusive,
    'install-autoinstaller': RequestExclusivityClass.Exclusive,
    link: RequestExclusivityClass.Exclusive,
    'link-package': RequestExclusivityClass.Exclusive,
    list: RequestExclusivityClass.SharedRead,
    publish: RequestExclusivityClass.Exclusive,
    purge: RequestExclusivityClass.Exclusive,
    rebuild: RequestExclusivityClass.Exclusive,
    remove: RequestExclusivityClass.Exclusive,
    scan: RequestExclusivityClass.SharedRead,
    setup: RequestExclusivityClass.Exclusive,
    unlink: RequestExclusivityClass.Exclusive,
    update: RequestExclusivityClass.Exclusive,
    'update-autoinstaller': RequestExclusivityClass.Exclusive,
    'update-cloud-credentials': RequestExclusivityClass.Exclusive,
    'upgrade-interactive': RequestExclusivityClass.Exclusive,
    version: RequestExclusivityClass.Exclusive
  });

/**
 * Classifies a parsed Rush command for workspace admission.
 *
 * @remarks
 * Repository-defined, plugin-defined, and future commands fail closed to `EXCLUSIVE`. A resolver that has
 * parsed a repository-defined phased command classifies it with `classifyPhasedRushCommand` instead.
 *
 * @beta
 */
export function classifyRushCommand(options: IRushCommandClassificationOptions): RequestExclusivityClass {
  if (options.commandOrigin !== 'built-in') {
    return RequestExclusivityClass.Exclusive;
  }
  return Object.hasOwn(BUILT_IN_RUSH_COMMAND_CLASSIFICATION, options.commandName)
    ? BUILT_IN_RUSH_COMMAND_CLASSIFICATION[options.commandName]
    : RequestExclusivityClass.Exclusive;
}

export interface IPhasedRushCommandClassificationOptions extends IRushCommandClassificationOptions {
  /** False for `rebuild` and for command-line.json phased commands with `"incremental": false`. */
  readonly isIncremental: boolean;
}

/**
 * Classifies a phased command that the daemon parsed natively and serves on its warm graph.
 *
 * @remarks
 * Built-in commands use {@link BUILT_IN_RUSH_COMMAND_CLASSIFICATION}. A phased command from command-line.json
 * shares build admission when it is incremental, like `build`, and is exclusive otherwise, like `rebuild`.
 */
export function classifyPhasedRushCommand(
  options: IPhasedRushCommandClassificationOptions
): RequestExclusivityClass {
  if (options.commandOrigin === 'custom') {
    return options.isIncremental ? RequestExclusivityClass.SharedBuild : RequestExclusivityClass.Exclusive;
  }
  return classifyRushCommand(options);
}
