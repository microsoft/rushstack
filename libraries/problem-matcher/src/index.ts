// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Parse VS Code style problem matcher definitions and use them to extract
 * structured problem reports from strings.
 *
 * @packageDocumentation
 */

export type {
  ProblemSeverity,
  IProblemMatcher,
  IProblemMatcherJson,
  IProblemPattern,
  IProblem
} from './ProblemMatcher';
export { parseProblemMatchersJson } from './ProblemMatcher';
