// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A stub replacement of `\@storybook/telemetry` for use in environments that absolutely
 * forbid outbound network connections and want to ensure that Storybook doesn't probe
 * outside of its project folder, e.g. for discovering what kind of package manager the
 * repository uses.
 *
 * All exported names mirror those of the official `\@storybook/telemetry` package, but
 * every function is a no-op and every object is an empty stand-in.
 *
 * @packageDocumentation
 */

// ---- objects ----

/**
 * No-op stub for `metaFrameworks`.
 * @public
 */
export const metaFrameworks: Record<string, string> = {};

// ---- functions (v6+) ----

/**
 * No-op stub for `sanitizeAddonName`.
 * @public
 */
export function sanitizeAddonName(): string {
  return '';
}

/**
 * No-op stub for `computeStorybookMetadata`.
 * Returns a minimal object to satisfy callers that expect a non-null result.
 * @public
 */
export async function computeStorybookMetadata(): Promise<Record<string, unknown>> {
  return {};
}

/**
 * No-op stub for `getStorybookMetadata`.
 * Returns a minimal object to satisfy callers that expect a non-null result.
 * @public
 */
export async function getStorybookMetadata(): Promise<Record<string, unknown>> {
  return {};
}

/**
 * No-op stub for `telemetry`.
 * @public
 */
export async function telemetry(): Promise<void> {
  // no-op
}

// ---- functions (v7+) ----

/**
 * No-op stub for `addToGlobalContext`.
 * @public
 */
export function addToGlobalContext(): void {
  // no-op
}

/**
 * No-op stub for `getPrecedingUpgrade`.
 * @public
 */
export async function getPrecedingUpgrade(): Promise<undefined> {
  return undefined;
}

/**
 * No-op stub for `oneWayHash`.
 * @public
 */
export function oneWayHash(): string {
  return '';
}

// ---- functions (v8+) ----

/**
 * No-op stub for `cleanPaths`.
 * @public
 */
export function cleanPaths(): string {
  return '';
}

/**
 * No-op stub for `isExampleStoryId`.
 * @public
 */
export function isExampleStoryId(): boolean {
  return false;
}

/**
 * No-op stub for `removeAnsiEscapeCodes`.
 * @public
 */
export function removeAnsiEscapeCodes(): string {
  return '';
}

/**
 * No-op stub for `sanitizeError`.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeError(): any {
  return {};
}
