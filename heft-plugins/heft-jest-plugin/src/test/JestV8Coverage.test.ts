// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { ScriptCov, FunctionCov, RangeCov } from '@bcoe/v8-coverage';

import {
  addV8Coverage,
  validateV8Ranges,
  type IJestV8Coverage,
  type IJestCoverageSourceMap
} from '../JestV8Coverage';

const execFileAsync = promisify(execFile);

function createEntry(): IJestV8Coverage {
  return {
    result: {
      scriptId: '1',
      url: 'source.js',
      functions: [
        {
          functionName: 'outer',
          isBlockCoverage: true,
          ranges: [
            { startOffset: 0, endOffset: 100, count: 1 },
            { startOffset: 70, endOffset: 90, count: 0 }
          ]
        },
        {
          functionName: 'inner',
          isBlockCoverage: true,
          ranges: [
            { startOffset: 10, endOffset: 60, count: 1 },
            { startOffset: 30, endOffset: 40, count: 0 }
          ]
        }
      ]
    },
    source: '.'.repeat(100),
    sourceMap: null,
    baseline: false
  };
}

function createBaseline(source: string = '\u00e9'): IJestV8Coverage {
  return {
    result: {
      scriptId: '0',
      url: 'source.js',
      functions: [
        {
          functionName: '(empty-report)',
          isBlockCoverage: true,
          ranges: [{ startOffset: 0, endOffset: Buffer.byteLength(source), count: 0 }]
        }
      ]
    },
    source,
    sourceMap: null,
    baseline: true
  };
}

function createSourceMap(): IJestCoverageSourceMap {
  return { version: 3, sources: ['source.ts'], sourcesContent: ['original'], names: [], mappings: 'AAAA' };
}

// Node 22.23.4, one final precise capture without Debugger: instantiate, run(false/true/false),
// instantiate in a second context, collect garbage, then run(true) on the first instance.
function createClassInitializerEntry(): IJestV8Coverage {
  return {
    result: {
      scriptId: '366',
      url: 'static-and-instance.js',
      functions: [
        {
          functionName: '',
          ranges: [{ startOffset: 0, endOffset: 87, count: 2 }],
          isBlockCoverage: true
        },
        {
          functionName: '<static_initializer>',
          ranges: [{ startOffset: 7, endOffset: 79, count: 2 }],
          isBlockCoverage: true
        },
        {
          functionName: '<instance_members_initializer>',
          ranges: [{ startOffset: 7, endOffset: 79, count: 2 }],
          isBlockCoverage: true
        },
        {
          functionName: 'value',
          ranges: [{ startOffset: 29, endOffset: 40, count: 2 }],
          isBlockCoverage: true
        },
        {
          functionName: 'run',
          ranges: [
            { startOffset: 41, endOffset: 78, count: 4 },
            { startOffset: 62, endOffset: 77, count: 2 }
          ],
          isBlockCoverage: true
        }
      ]
    },
    source: 'class C{static value=1;value=()=>C.value;run(flag){return flag?this.value():2}};new C()',
    sourceMap: null,
    baseline: false
  };
}

function getFunctionCounts(fn: FunctionCov): number[] {
  const root: RangeCov = fn.ranges[0];
  return Array.from({ length: root.endOffset - root.startOffset }, (unused, index) =>
    fn.ranges.reduce(
      (count, range) =>
        root.startOffset + index >= range.startOffset && root.startOffset + index < range.endOffset
          ? range.count
          : count,
      0
    )
  );
}

async function captureAsync(
  calls: boolean[],
  source: string = 'function outer(x){ function inner(y){if(y)return 1; return 2;} if(x)return inner(x); return 3; }\n',
  functionName: string = 'outer',
  resetBeforeCalls: boolean = false
): Promise<IJestV8Coverage> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      '-e',
      `
        const { Session } = require('node:inspector');
        const { promisify } = require('node:util');
        (async () => {
          const session = new Session();
          session.connect();
          try {
            const post = promisify(session.post.bind(session));
            await post('Profiler.enable');
            await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
            const result = new (require('node:vm').Script)(process.argv[1], { filename: 'nested-coverage.js' }).runInThisContext();
            const callable = typeof result === 'function' ? result : globalThis[process.argv[3]];
            if (JSON.parse(process.argv[4])) await post('Profiler.takePreciseCoverage');
            for (const value of JSON.parse(process.argv[2])) callable(value);
            const coverage = await post('Profiler.takePreciseCoverage');
            const captured = coverage.result.find(entry => entry.url === 'nested-coverage.js');
            if (!captured) throw new Error('Missing fixture coverage');
            process.stdout.write(JSON.stringify(captured));
          } finally {
            session.disconnect();
          }
        })().catch(error => { console.error(error); process.exitCode = 1; });
      `,
      source,
      JSON.stringify(calls),
      functionName,
      JSON.stringify(resetBeforeCalls)
    ],
    { timeout: 20000 }
  );
  const result: ScriptCov = JSON.parse(stdout);
  return { result, source, sourceMap: null, baseline: false };
}

describe('JestV8Coverage', () => {
  it('retains the distinct coincident class initializers in a complete Node 22 capture', () => {
    const entry: IJestV8Coverage = createClassInitializerEntry();
    const original: IJestV8Coverage = structuredClone(entry);
    const scripts: Map<string, IJestV8Coverage> = new Map();
    for (let i: number = 0; i < 3; i++) {
      addV8Coverage(scripts, entry);
    }
    expect(scripts.size).toBe(1);
    expect(scripts.get(entry.result.url)!.result.functions).toEqual(
      entry.result.functions.map((fn) => ({
        ...fn,
        ranges: fn.ranges.map((range) => ({ ...range, count: range.count * 3 }))
      }))
    );
    expect(entry).toEqual(original);
  });

  it('matches coincident named roles independently of their order and counts', () => {
    const entry: IJestV8Coverage = createClassInitializerEntry();
    const next: IJestV8Coverage = structuredClone(entry);
    next.result.functions[1].ranges[0].count = 7;
    next.result.functions[2].ranges[0].count = 3;
    next.result.functions.splice(1, 2, next.result.functions[2], next.result.functions[1]);
    const originals: IJestV8Coverage[] = structuredClone([entry, next]);
    for (const contributions of [
      [entry, next],
      [next, entry]
    ]) {
      const scripts: Map<string, IJestV8Coverage> = new Map();
      for (const contribution of contributions) {
        addV8Coverage(scripts, contribution);
      }
      const functions: FunctionCov[] = scripts.get(entry.result.url)!.result.functions;
      expect(functions).toHaveLength(5);
      expect(new Map(functions.map((fn) => [fn.functionName, fn.ranges]))).toEqual(
        new Map([
          ['', [{ startOffset: 0, endOffset: 87, count: 4 }]],
          ['<static_initializer>', [{ startOffset: 7, endOffset: 79, count: 9 }]],
          ['<instance_members_initializer>', [{ startOffset: 7, endOffset: 79, count: 5 }]],
          ['value', [{ startOffset: 29, endOffset: 40, count: 4 }]],
          [
            'run',
            [
              { startOffset: 41, endOffset: 78, count: 8 },
              { startOffset: 62, endOffset: 77, count: 4 }
            ]
          ]
        ])
      );
    }
    expect([entry, next]).toEqual(originals);
  });

  it.each<[string, (entry: IJestV8Coverage) => void]>([
    [
      'duplicate role',
      (entry) => {
        entry.result.functions[2].functionName = '<static_initializer>';
      }
    ],
    [
      'anonymous role',
      (entry) => {
        entry.result.functions[2].functionName = '';
      }
    ],
    [
      'changed role',
      (entry) => {
        entry.result.functions[2].functionName = 'different';
      }
    ],
    [
      'missing role',
      (entry) => {
        entry.result.functions.splice(2, 1);
      }
    ]
  ])('rejects a %s in coincident named functions without changing state', (unused, mutate) => {
    const entry: IJestV8Coverage = createClassInitializerEntry();
    const scripts: Map<string, IJestV8Coverage> = new Map();
    addV8Coverage(scripts, entry);
    const retained: IJestV8Coverage = scripts.get(entry.result.url)!;
    const invalid: IJestV8Coverage = structuredClone(entry);
    mutate(invalid);
    const original: IJestV8Coverage = structuredClone(invalid);
    expect(() => addV8Coverage(scripts, invalid)).toThrow('Ambiguous raw V8 function identity');
    expect(scripts.get(entry.result.url)).toBe(retained);
    expect(retained).toEqual(entry);
    expect(invalid).toEqual(original);
  });

  it.each([
    ['named', 'function unused() {}', 'unused'],
    ['anonymous', '()=>{}', '']
  ])('retains uncalled %s functions sharing the script span', async (unused, source, functionName) => {
    const entry: IJestV8Coverage = await captureAsync([], source, functionName);
    const original: IJestV8Coverage = structuredClone(entry);
    expect(entry.result.functions).toHaveLength(2);
    expect(entry.result.functions.map((fn) => fn.ranges[0])).toEqual([
      { startOffset: 0, endOffset: source.length, count: 1 },
      { startOffset: 0, endOffset: source.length, count: 0 }
    ]);
    const scripts: Map<string, IJestV8Coverage> = new Map();
    addV8Coverage(scripts, entry);
    addV8Coverage(scripts, entry);
    expect(scripts.get(entry.result.url)!.result.functions).toEqual([
      { ...entry.result.functions[0], ranges: [{ startOffset: 0, endOffset: source.length, count: 2 }] },
      entry.result.functions[1]
    ]);
    expect(entry).toEqual(original);
  });

  it.each([
    ['named', 'function outer(x){return x?1:2;}'],
    ['anonymous', '(x)=>x?1:2']
  ])(
    'preserves %s coincident function counts and branches in either arrival order',
    async (unused, source) => {
      const [uncalled, first, second, canonical] = await Promise.all([
        captureAsync([], source),
        captureAsync([true], source),
        captureAsync([false], source),
        captureAsync([true, false, true], source)
      ]);
      expect(canonical.result.functions).toHaveLength(2);
      expect(canonical.result.functions.map((fn) => fn.ranges[0])).toEqual([
        { startOffset: 0, endOffset: source.length, count: 1 },
        { startOffset: 0, endOffset: source.length, count: 3 }
      ]);
      const entries: IJestV8Coverage[] = [uncalled, first, second, first];
      const originals: IJestV8Coverage[] = structuredClone(entries);
      for (const contributions of [entries, [...entries].reverse()]) {
        const scripts: Map<string, IJestV8Coverage> = new Map();
        for (const entry of contributions) {
          addV8Coverage(scripts, entry);
        }
        expect(scripts.size).toBe(1);
        const actual: FunctionCov[] = scripts.get(first.result.url)!.result.functions;
        const expected: FunctionCov[] = [
          {
            ...canonical.result.functions[0],
            ranges: [{ startOffset: 0, endOffset: source.length, count: 4 }]
          },
          canonical.result.functions[1]
        ];
        // Equivalent counts can use different nesting; compare every offset within each distinct function.
        expect(actual.map((fn) => ({ ...fn, ranges: [fn.ranges[0]] }))).toEqual(
          expected.map((fn) => ({ ...fn, ranges: [fn.ranges[0]] }))
        );
        expect(actual.map(getFunctionCounts)).toEqual(expected.map(getFunctionCounts));
      }
      expect(entries).toEqual(originals);
    }
  );

  it.each([true, false])(
    'rejects ambiguous sparse anonymous captures (complete first: %s)',
    async (first) => {
      const complete: IJestV8Coverage = await captureAsync([], '()=>{}');
      const sparse: IJestV8Coverage = await captureAsync([true], '()=>{}', '', true);
      expect(complete.result.functions).toHaveLength(2);
      expect(sparse.result.functions).toHaveLength(1);
      const [initial, incoming] = first ? [complete, sparse] : [sparse, complete];
      const scripts: Map<string, IJestV8Coverage> = new Map();
      addV8Coverage(scripts, initial);
      const original: IJestV8Coverage = structuredClone(initial);
      expect(() => addV8Coverage(scripts, incoming)).toThrow('Ambiguous raw V8 function identity');
      expect([...scripts.values()]).toEqual([original]);
    }
  );

  it('rejects reordered or indistinguishable extra coincident functions without changing state', async () => {
    const entry: IJestV8Coverage = await captureAsync([], 'function unused() {}', 'unused');
    const scripts: Map<string, IJestV8Coverage> = new Map();
    addV8Coverage(scripts, entry);
    const reordered: IJestV8Coverage = structuredClone(entry);
    reordered.result.functions.reverse();
    const extra: IJestV8Coverage = structuredClone(entry);
    extra.result.functions.push(structuredClone(extra.result.functions[1]));
    for (const invalid of [reordered, extra]) {
      expect(() => addV8Coverage(scripts, invalid)).toThrow('Ambiguous raw V8 function identity');
      expect([...scripts.values()]).toEqual([entry]);
    }
  });

  it('merges nested functions like a single V8 capture without inventing inner branch hits', async () => {
    const [first, second, canonical] = await Promise.all([
      captureAsync([true]),
      captureAsync([false]),
      captureAsync([true, false])
    ]);
    const scripts: Map<string, IJestV8Coverage> = new Map();
    addV8Coverage(scripts, first);
    addV8Coverage(scripts, second);
    const merged: ScriptCov = scripts.get(first.result.url)!.result;
    const namedFunctions = (result: ScriptCov): ScriptCov['functions'] =>
      result.functions.filter((fn) => fn.functionName);
    expect(namedFunctions(merged).map((fn) => fn.functionName)).toEqual(['outer', 'inner']);
    expect(namedFunctions(merged)).toEqual(namedFunctions(canonical.result));
    expect(merged.functions.find((fn) => fn.functionName === 'inner')!.ranges).toContainEqual(
      expect.objectContaining({ count: 0 })
    );
    const reverse: Map<string, IJestV8Coverage> = new Map();
    addV8Coverage(reverse, second);
    addV8Coverage(reverse, first);
    expect(reverse.get(first.result.url)!.result.functions).toEqual(merged.functions);
  });

  it('sums repeated counts while retaining one independent range tree per script', () => {
    const entry: IJestV8Coverage = createEntry();
    const original: IJestV8Coverage = structuredClone(entry);
    const scripts: Map<string, IJestV8Coverage> = new Map();
    for (let i: number = 0; i < 20; i++) {
      addV8Coverage(scripts, entry);
    }
    const retained: IJestV8Coverage = scripts.get(entry.result.url)!;
    expect(scripts.size).toBe(1);
    expect(retained.result.functions).toEqual(
      entry.result.functions.map((fn) => ({
        ...fn,
        ranges: fn.ranges.map((range) => ({ ...range, count: range.count * 20 }))
      }))
    );
    expect(JSON.stringify(retained).length).toBeLessThan(JSON.stringify(entry).length + 10);
    expect(entry).toEqual(original);
    addV8Coverage(scripts, { ...entry, result: { ...entry.result, url: 'other.js' } });
    expect(scripts.size).toBe(2);
    expect(scripts.get('source.js')).toBe(retained);
  });

  it.each([true, false])('lets executed coverage supersede baselines (baseline first: %s)', (first) => {
    const scripts: Map<string, IJestV8Coverage> = new Map();
    const baseline: IJestV8Coverage = createBaseline();
    const executed: IJestV8Coverage = createEntry();
    executed.sourceMap = createSourceMap();
    for (const entry of first ? [baseline, executed] : [executed, baseline]) {
      addV8Coverage(scripts, entry);
    }
    expect([...scripts.values()]).toEqual([executed]);
  });

  it.each(['', '\u00e9', '#!/usr/bin/env node\r\n\u00e9'])(
    'retains canonical byte-length baselines without accumulating counts: %j',
    (source) => {
      const scripts: Map<string, IJestV8Coverage> = new Map();
      const baseline: IJestV8Coverage = createBaseline(source);
      addV8Coverage(scripts, baseline);
      addV8Coverage(scripts, structuredClone(baseline));
      expect([...scripts.values()]).toEqual([baseline]);
    }
  );

  it.each<[string, (entry: IJestV8Coverage) => void]>([
    [
      'positive count',
      (entry) => {
        entry.result.functions[0].ranges[0].count = 1;
      }
    ],
    [
      'wrong name',
      (entry) => {
        entry.result.functions[0].functionName = 'executed';
      }
    ],
    [
      'function coverage',
      (entry) => {
        entry.result.functions[0].isBlockCoverage = false;
      }
    ],
    [
      'character length',
      (entry) => {
        entry.result.functions[0].ranges[0].endOffset = 1;
      }
    ],
    [
      'extra function',
      (entry) => {
        entry.result.functions.push(entry.result.functions[0]);
      }
    ],
    [
      'executed marker',
      (entry) => {
        entry.baseline = false;
      }
    ]
  ])('rejects malformed baselines before supersession: %s', (unused, mutate) => {
    const scripts: Map<string, IJestV8Coverage> = new Map();
    const executed: IJestV8Coverage = createEntry();
    addV8Coverage(scripts, executed);
    const invalid: IJestV8Coverage = createBaseline();
    mutate(invalid);
    expect(() => addV8Coverage(scripts, invalid)).toThrow('Invalid raw V8');
    expect([...scripts.values()]).toEqual([executed]);
  });

  it.each([
    ['negative count', { count: -1 }],
    ['fractional count', { count: 0.5 }],
    ['unsafe count', { count: Number.MAX_SAFE_INTEGER + 1 }],
    ['nonfinite count', { count: Infinity }],
    ['negative start', { startOffset: -1 }],
    ['fractional start', { startOffset: 0.5 }],
    ['unsafe start', { startOffset: Number.MAX_SAFE_INTEGER + 1 }],
    ['nonfinite end', { endOffset: NaN }],
    ['fractional end', { endOffset: 99.5 }],
    ['unsafe end', { endOffset: Number.MAX_SAFE_INTEGER + 1 }],
    ['reversed range', { endOffset: -1 }],
    ['past source', { endOffset: 101 }]
  ] as const)('rejects invalid numeric ranges before replacing a baseline: %s', (unused, change) => {
    const scripts: Map<string, IJestV8Coverage> = new Map();
    const baseline: IJestV8Coverage = createBaseline();
    addV8Coverage(scripts, baseline);
    const invalid: IJestV8Coverage = createEntry();
    Object.assign(invalid.result.functions[0].ranges[0], change);
    expect(() => addV8Coverage(scripts, invalid)).toThrow('Invalid raw V8');
    expect([...scripts.values()]).toEqual([baseline]);
  });

  it.each<{ name: string; ranges: RangeCov[] }>([
    { name: 'missing', ranges: [] },
    {
      name: 'empty child',
      ranges: [
        { startOffset: 0, endOffset: 100, count: 1 },
        { startOffset: 100, endOffset: 100, count: 0 }
      ]
    },
    {
      name: 'duplicate',
      ranges: [
        { startOffset: 0, endOffset: 100, count: 1 },
        { startOffset: 0, endOffset: 100, count: 2 }
      ]
    },
    {
      name: 'out-of-root',
      ranges: [
        { startOffset: 0, endOffset: 100, count: 1 },
        { startOffset: 10, endOffset: 101, count: 0 }
      ]
    },
    {
      name: 'unordered',
      ranges: [
        { startOffset: 0, endOffset: 100, count: 1 },
        { startOffset: 20, endOffset: 40, count: 0 },
        { startOffset: 10, endOffset: 15, count: 1 }
      ]
    },
    {
      name: 'crossing',
      ranges: [
        { startOffset: 0, endOffset: 100, count: 1 },
        { startOffset: 10, endOffset: 40, count: 0 },
        { startOffset: 30, endOffset: 50, count: 1 }
      ]
    }
  ])('rejects $name ranges before merging', ({ ranges }) => {
    const scripts: Map<string, IJestV8Coverage> = new Map();
    const entry: IJestV8Coverage = createEntry();
    addV8Coverage(scripts, entry);
    const invalid: IJestV8Coverage = createEntry();
    invalid.result.functions[0].ranges = ranges;
    expect(() => addV8Coverage(scripts, invalid)).toThrow();
    expect([...scripts.values()]).toEqual([entry]);
  });

  it('accepts nested ranges with shared starts and adjacent siblings, but rejects missing functions', () => {
    const entry: IJestV8Coverage = createEntry();
    entry.result.functions[0].ranges = [
      { startOffset: 0, endOffset: 100, count: 1 },
      { startOffset: 0, endOffset: 50, count: 0 },
      { startOffset: 10, endOffset: 20, count: 1 },
      { startOffset: 50, endOffset: 100, count: 0 }
    ];
    expect(() => validateV8Ranges(entry)).not.toThrow();
    entry.result.functions = [];
    expect(() => validateV8Ranges(entry)).toThrow('Invalid raw V8');
  });

  it('bounds unmapped execution by UTF-16 text after shebang removal, not UTF-8 bytes', () => {
    const entry: IJestV8Coverage = createEntry();
    entry.source = '#!/usr/bin/env node\r\n\u00e9';
    entry.result.functions = [
      { functionName: '', isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: 3, count: 1 }] }
    ];
    expect(() => validateV8Ranges(entry)).not.toThrow();
    entry.result.functions[0].ranges[0].endOffset = 4;
    expect(() => validateV8Ranges(entry)).toThrow('Invalid raw V8');
    entry.sourceMap = createSourceMap();
    entry.result.functions[0].ranges[0].endOffset = entry.source.length;
    expect(() => validateV8Ranges(entry)).not.toThrow();
  });

  it.each(['source', 'sourceMap'] as const)(
    'rejects incompatible executed %s without changing state',
    (field) => {
      const scripts: Map<string, IJestV8Coverage> = new Map();
      const entry: IJestV8Coverage = createEntry();
      entry.sourceMap = createSourceMap();
      addV8Coverage(scripts, entry);
      const changed: IJestV8Coverage = structuredClone(entry);
      if (field === 'source') {
        changed.source += '.';
      } else {
        changed.sourceMap!.sourcesContent[0] = 'changed';
      }
      expect(() => addV8Coverage(scripts, changed)).toThrow('Incompatible V8');
      expect([...scripts.values()]).toEqual([entry]);
    }
  );

  it('owns captured range trees and maps without mutating incoming observations', () => {
    const scripts: Map<string, IJestV8Coverage> = new Map();
    const entry: IJestV8Coverage = createEntry();
    entry.sourceMap = createSourceMap();
    const original: IJestV8Coverage = structuredClone(entry);
    addV8Coverage(scripts, entry);
    entry.sourceMap.sourcesContent[0] = 'changed';
    entry.result.functions[0].ranges[0].count = 99;
    expect([...scripts.values()]).toEqual([original]);
    const contribution: IJestV8Coverage = structuredClone(original);
    addV8Coverage(scripts, contribution);
    expect(contribution).toEqual(original);
    contribution.sourceMap!.names.push('changed');
    expect(scripts.get(entry.result.url)!.sourceMap).toEqual(original.sourceMap);
  });

  it('rejects count overflow after merging without corrupting accumulated or incoming ranges', () => {
    const scripts: Map<string, IJestV8Coverage> = new Map();
    const entry: IJestV8Coverage = createEntry();
    entry.result.functions[0].ranges[0].count = Number.MAX_SAFE_INTEGER;
    addV8Coverage(scripts, entry);
    const next: IJestV8Coverage = createEntry();
    const original: IJestV8Coverage = structuredClone(next);
    expect(() => addV8Coverage(scripts, next)).toThrow('Invalid raw V8');
    expect([...scripts.values()]).toEqual([entry]);
    expect(next).toEqual(original);
  });
});
