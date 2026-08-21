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
 * Names are validated with {@link parseReporterExtensionEventName} or narrowed
 * with {@link isReporterExtensionEventName} before being emitted. The brand
 * prevents unchecked strings from crossing the producer API.
 *
 * @beta
 */
export type ReporterExtensionEventName = `${string}.${string}` & {
  readonly __reporterExtensionEventNameBrand: 'ReporterExtensionEventName';
};

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
export function isReporterExtensionEventName(name: string): name is ReporterExtensionEventName {
  return EXTENSION_EVENT_NAME_REGEXP.test(name);
}

/**
 * Validates an extension event name and returns its branded representation.
 *
 * @param name - the candidate extension event name
 * @throws Error if `name` is malformed
 *
 * @beta
 */
export function parseReporterExtensionEventName(name: string): ReporterExtensionEventName {
  if (!isReporterExtensionEventName(name)) {
    throw new Error(`Invalid reporter extension event name: ${JSON.stringify(name)}.`);
  }
  return name;
}
