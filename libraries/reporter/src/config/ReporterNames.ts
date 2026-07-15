// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The name of a built-in reporter.
 *
 * @beta
 */
export type ReporterName = 'default' | 'ai' | 'json' | 'plaintext' | 'file' | 'legacy';

/**
 * A reporter log level, in order of increasing verbosity.
 *
 * @beta
 */
export type ReporterLogLevel = 'quiet' | 'normal' | 'verbose' | 'debug';

/**
 * The built-in reporter names.
 *
 * @beta
 */
export const SUPPORTED_REPORTER_NAMES: readonly ReporterName[] = [
  'default',
  'ai',
  'json',
  'plaintext',
  'file',
  'legacy'
];

/**
 * The supported log levels.
 *
 * @beta
 */
export const SUPPORTED_LOG_LEVELS: readonly ReporterLogLevel[] = ['quiet', 'normal', 'verbose', 'debug'];

/**
 * Returns `true` if `name` is a supported reporter name.
 *
 * @beta
 */
export function isSupportedReporterName(name: string): name is ReporterName {
  return (SUPPORTED_REPORTER_NAMES as readonly string[]).includes(name);
}

/**
 * Returns `true` if `level` is a supported log level.
 *
 * @beta
 */
export function isSupportedLogLevel(level: string): level is ReporterLogLevel {
  return (SUPPORTED_LOG_LEVELS as readonly string[]).includes(level);
}
