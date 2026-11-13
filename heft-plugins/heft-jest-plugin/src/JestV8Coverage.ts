// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDeepStrictEqual } from 'node:util';

import { mergeScriptCovs, type ScriptCov, type FunctionCov, type RangeCov } from '@bcoe/v8-coverage';

export interface IJestCoverageSourceMap {
  version: 3;
  /** Build-root-relative original identities, materialized as absolute paths only for conversion. */
  sources: string[];
  sourcesContent: string[];
  names: string[];
  mappings: string;
  /** The self-source's shebang was restored for hashing; conversion must use Jest's actual input text. */
  inputShebangRemoved?: true;
}

export interface IJestV8Coverage {
  result: ScriptCov;
  /** Generated text for mapped scripts; otherwise the full input before Jest removes its shebang. */
  source: string;
  // eslint-disable-next-line @rushstack/no-new-null -- Explicit absence of captured source-map data.
  sourceMap: IJestCoverageSourceMap | null;
  baseline: boolean;
}

/** Jest's ScriptTransformer removes the initial shebang, but preserves its newline. */
export function normalizeJestCoverageInput(source: string): string {
  return source.replace(/^#!.*/, '');
}

/** Validate function-scoped ranges on an already typed observation, not an unknown JSON payload. */
export function validateV8Ranges(entry: IJestV8Coverage): void {
  const sourceLength: number = (entry.sourceMap ? entry.source : normalizeJestCoverageInput(entry.source))
    .length;
  for (const fn of entry.result.functions) {
    const root: RangeCov | undefined = fn.ranges[0];
    if (!root) {
      throw new Error('Missing raw V8 function-scoped coverage ranges.');
    }
    let previousStart: number = -1;
    const parents: RangeCov[] = [];
    for (const range of fn.ranges) {
      if (
        !Number.isSafeInteger(range.count) ||
        range.count < 0 ||
        !Number.isSafeInteger(range.startOffset) ||
        range.startOffset < 0 ||
        !Number.isSafeInteger(range.endOffset) ||
        range.startOffset < root.startOffset ||
        range.endOffset > root.endOffset ||
        range.endOffset < range.startOffset ||
        (fn.ranges.length > 1 && range.endOffset === range.startOffset) ||
        range.startOffset < previousStart ||
        (!entry.baseline && range.endOffset > sourceLength)
      ) {
        throw new Error('Invalid raw V8 function-scoped coverage range.');
      }
      while (parents.length && range.startOffset >= parents[parents.length - 1].endOffset) {
        parents.pop();
      }
      const parent: RangeCov | undefined = parents[parents.length - 1];
      if (
        parent &&
        (range.endOffset > parent.endOffset ||
          (range.startOffset === parent.startOffset && range.endOffset === parent.endOffset))
      ) {
        throw new Error('Crossing or duplicate raw V8 coverage ranges.');
      }
      parents.push(range);
      previousStart = range.startOffset;
    }
  }
  const empty: FunctionCov | undefined = entry.result.functions[0];
  if (
    !empty ||
    (entry.baseline
      ? entry.result.functions.length !== 1 ||
        empty.functionName !== '(empty-report)' ||
        !empty.isBlockCoverage ||
        empty.ranges.length !== 1 ||
        empty.ranges[0].count !== 0 ||
        empty.ranges[0].startOffset !== 0 ||
        empty.ranges[0].endOffset !== Buffer.byteLength(entry.source)
      : entry.result.functions.some((fn) => fn.functionName === '(empty-report)'))
  ) {
    throw new Error('Invalid raw V8 untested-file baseline.');
  }
}

/**
 * Retain one source/map and function-scoped range tree per script, not one copy per suite.
 * Callers must populate the map only through this function and must not mutate its retained entries.
 * JSON shape, source identities, source-map integrity and source hashes must be validated separately.
 */
export function addV8Coverage(scripts: Map<string, IJestV8Coverage>, entry: IJestV8Coverage): void {
  // Validate before normalization/supersession: merging must never erase malformed observations.
  validateV8Ranges(entry);
  const previous: IJestV8Coverage | undefined = scripts.get(entry.result.url);
  if (previous && previous.baseline !== entry.baseline) {
    // Untested code has not been transformed; its baseline must not constrain executed code.
    if (entry.baseline) {
      return;
    }
  } else if (previous) {
    if (previous.source !== entry.source || !isDeepStrictEqual(previous.sourceMap, entry.sourceMap)) {
      throw new Error(`Incompatible V8 code or source maps: "${entry.result.url}".`);
    }
    if (entry.baseline) {
      return;
    }
    const merged: IJestV8Coverage = {
      ...previous,
      result: mergeScriptCovs([structuredClone(previous.result), structuredClone(entry.result)])!
    };
    validateV8Ranges(merged);
    scripts.set(entry.result.url, merged);
    return;
  }
  scripts.set(entry.result.url, structuredClone(entry));
}
