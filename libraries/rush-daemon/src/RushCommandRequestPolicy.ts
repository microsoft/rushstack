// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RequestExclusivityClass } from './RequestScheduler';

/**
 * Admission classifications for every command that `RushCommandLineParser` registers without repository config.
 *
 * @beta
 */
export const BUILT_IN_RUSH_COMMAND_CLASSIFICATION: Readonly<Record<string, RequestExclusivityClass>> =
  Object.freeze({
    add: RequestExclusivityClass.Exclusive,
    alert: RequestExclusivityClass.SharedRead,
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
 * Repository-defined, plugin-defined, and future commands fail closed to `EXCLUSIVE`.
 *
 * @beta
 */
export function classifyRushCommand(commandName: string): RequestExclusivityClass {
  return Object.hasOwn(BUILT_IN_RUSH_COMMAND_CLASSIFICATION, commandName)
    ? BUILT_IN_RUSH_COMMAND_CLASSIFICATION[commandName]
    : RequestExclusivityClass.Exclusive;
}
