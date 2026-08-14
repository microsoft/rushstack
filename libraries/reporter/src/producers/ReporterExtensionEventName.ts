// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The lowercase ASCII letters that a valid extension-event segment must start
 * with.
 *
 * @remarks
 * Enumerating the letters lets {@link ReporterExtensionEventName} reject a
 * leading digit, a leading hyphen, uppercase, or whitespace at the start of both
 * the namespace and the name segment, which a bare `${string}.${string}` floor
 * would admit.
 *
 * @beta
 */
export type ReporterExtensionEventNameSegmentStart =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z';

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
 * This template-literal type enforces the namespaced format at compile time: it
 * requires a vendor namespace and a name segment, each beginning with a
 * lowercase letter, separated by a dot. Like the diagnostic-code types, it
 * intentionally approximates the full character set — it cannot express "no
 * trailing hyphen" or "no empty middle segment" — so
 * {@link isReporterExtensionEventName} remains the exact matcher for untyped
 * input such as decoded wire payloads.
 *
 * @beta
 */
export type ReporterExtensionEventName =
  `${ReporterExtensionEventNameSegmentStart}${string}.${ReporterExtensionEventNameSegmentStart}${string}`;

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
