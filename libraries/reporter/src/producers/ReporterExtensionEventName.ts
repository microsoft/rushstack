// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The name of an extension event.
 *
 * @remarks
 * Extension events carry namespaced beta identifiers of the form
 * `<namespace>.<name>`, for example `acme.cache-warmed`. Each dot-separated
 * segment is lowercase and begins with a letter. Namespacing keeps third-party
 * event names from colliding with the closed core event set, which remains
 * controlled by Rush.
 *
 * @beta
 */
export type ReporterExtensionEventName = string;

const EXTENSION_EVENT_NAME_REGEXP: RegExp =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

/**
 * Returns `true` if `name` is a valid namespaced extension event identifier.
 *
 * @remarks
 * A valid name has at least two dot-separated segments (a namespace and a name).
 * Each segment is lowercase, begins with a letter, and may contain digits and
 * internal single hyphens.
 *
 * @param name - the candidate extension event name
 *
 * @beta
 */
export function isReporterExtensionEventName(name: string): boolean {
  return EXTENSION_EVENT_NAME_REGEXP.test(name);
}
