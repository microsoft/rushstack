// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO(reconcile): replace with `isReporterExtensionEventName` from
// `@rushstack/reporter` once that package merges into main (#5858).

/**
 * The name of an extension event.
 *
 * @remarks
 * Extension events carry namespaced identifiers of the form `<namespace>.<name>`,
 * for example `rushd.client-subscribed`. Each dot-separated segment is lowercase
 * and begins with a letter. Namespacing keeps daemon-specific events from
 * colliding with the closed core event set.
 *
 * @beta
 */
export type DaemonExtensionEventName = string;

const EXTENSION_EVENT_NAME_REGEXP: RegExp =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

/**
 * The namespace reserved for rushd-specific extension events.
 *
 * @beta
 */
export const RUSHD_EXTENSION_NAMESPACE: 'rushd' = 'rushd';

const RUSHD_NAMESPACE_PREFIX: string = `${RUSHD_EXTENSION_NAMESPACE}.`;

/**
 * Returns `true` if `name` is a valid namespaced extension event identifier.
 *
 * @remarks
 * A valid name has at least two dot-separated segments (a namespace and a name).
 * Each segment is lowercase, begins with a letter, and may contain digits and
 * internal single hyphens.
 *
 * @beta
 */
export function isDaemonExtensionEventName(name: string): name is DaemonExtensionEventName {
  return EXTENSION_EVENT_NAME_REGEXP.test(name);
}

/**
 * Returns `true` if `name` is a valid extension event identifier in the
 * reserved `rushd.*` namespace.
 *
 * @beta
 */
export function isRushdExtensionEventName(name: string): boolean {
  return name.startsWith(RUSHD_NAMESPACE_PREFIX) && isDaemonExtensionEventName(name);
}
