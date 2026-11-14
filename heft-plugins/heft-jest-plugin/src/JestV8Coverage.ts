// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { isDeepStrictEqual } from 'node:util';

import {
  mergeScriptCovs,
  compareFunctionCovs,
  type ScriptCov,
  type FunctionCov,
  type RangeCov
} from '@bcoe/v8-coverage';

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
  /** Preserve V8's nesting order, including the script before a function with the same root span. */
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

function groupV8Functions(entry: IJestV8Coverage): Map<string, FunctionCov[]> {
  const groups: Map<string, FunctionCov[]> = new Map();
  for (const fn of entry.result.functions) {
    const root: RangeCov = fn.ranges[0];
    const key: string = `${root.startOffset};${root.endOffset}`;
    const group: FunctionCov[] | undefined = groups.get(key);
    if (group) {
      group.push(fn);
    } else {
      groups.set(key, [fn]);
    }
  }
  const sourceLength: number = (entry.sourceMap ? entry.source : normalizeJestCoverageInput(entry.source))
    .length;
  for (const group of groups.values()) {
    if (group.length === 1) continue;
    const root: RangeCov = group[0].ranges[0];
    if (root.startOffset === 0 && root.endOffset === sourceLength) {
      // V8 reports the top-level script before its coincident function, even for equal empty names.
      if (group.length === 2 && group[0] === entry.result.functions[0] && group[0].functionName === '') {
        continue;
      }
    } else {
      // Native roles such as static and instance initializers can share a non-root extent.
      const names: Set<string> = new Set(group.map((fn) => fn.functionName));
      if (!names.has('') && names.size === group.length) {
        continue;
      }
    }
    throw new Error(`Ambiguous raw V8 function identity: "${entry.result.url}".`);
  }
  return groups;
}

/**
 * Retain one source/map and function-scoped range tree per script, not one copy per suite.
 * Callers must populate the map only through this function and must not mutate its retained entries.
 * Coincident spans require complete captures in V8 nesting order, not sparse incremental captures.
 * A sparse anonymous range does not identify whether it belongs to the script or its function.
 * JSON shape, source identities, source-map integrity and source hashes must be validated separately.
 */
export function addV8Coverage(scripts: Map<string, IJestV8Coverage>, entry: IJestV8Coverage): void {
  // Validate before normalization/supersession: merging must never erase malformed observations.
  validateV8Ranges(entry);
  const incomingGroups: Map<string, FunctionCov[]> = groupV8Functions(entry);
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
    const result: ScriptCov = structuredClone(previous.result);
    const groups: Map<string, FunctionCov[]> = groupV8Functions({ ...previous, result });
    for (const [key, incoming] of incomingGroups) {
      const existing: FunctionCov[] | undefined = groups.get(key);
      let matched: FunctionCov[] = incoming;
      if (existing && incoming.length > 1 && incoming[0].functionName !== '') {
        const byName: Map<string, FunctionCov> = new Map(incoming.map((fn) => [fn.functionName, fn]));
        matched = existing.map((fn) => {
          const match: FunctionCov | undefined = byName.get(fn.functionName);
          if (!match) {
            throw new Error(`Ambiguous raw V8 function identity: "${entry.result.url}".`);
          }
          return match;
        });
      }
      if (
        existing &&
        (existing.length !== incoming.length ||
          existing.some((fn, index) => fn.functionName !== matched[index].functionName))
      ) {
        throw new Error(`Ambiguous raw V8 function identity: "${entry.result.url}".`);
      }
      groups.set(
        key,
        matched.map((fn, index) => {
          // mergeScriptCovs keys only by root offsets; give it one matched function per observation.
          const observations: ScriptCov[] = [{ ...entry.result, functions: [structuredClone(fn)] }];
          if (existing) {
            observations.unshift({ ...previous.result, functions: [existing[index]] });
          }
          return mergeScriptCovs(observations)!.functions[0];
        })
      );
    }
    result.functions = [...groups.values()].flat();
    result.functions.sort(compareFunctionCovs);
    const merged: IJestV8Coverage = { ...previous, result };
    validateV8Ranges(merged);
    scripts.set(entry.result.url, merged);
    return;
  }
  scripts.set(entry.result.url, structuredClone(entry));
}
