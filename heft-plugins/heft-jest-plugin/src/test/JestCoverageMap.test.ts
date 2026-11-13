// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { Script } from 'node:vm';
import { createCoverageMap, createFileCoverage, type CoverageMap } from 'istanbul-lib-coverage';
import { createInstrumenter, type InstrumenterOptions } from 'istanbul-lib-instrument';

import {
  coverageIdentity,
  portableCoverageMap,
  validateCoverageIdentity,
  type ICoverageSource,
  type IJestFileCoverageData
} from '../JestCoverageMap';

const ROOT: string = path.resolve(__dirname, 'coverage-root');
const IDENTITY: string = 'src/choose.js';
const SOURCE: string = [
  'function choose(value) {',
  '  if (value) {',
  "    return value && 'yes';",
  '  }',
  "  return 'no';",
  '}',
  ''
].join('\n');

function createMap(root: string = ROOT): CoverageMap {
  // Istanbul 6 supports reportLogic, but its community typings do not include the option.
  const options: Partial<InstrumenterOptions> & { reportLogic: boolean } = { reportLogic: true };
  const instrumenter = createInstrumenter(options);
  const context: { __coverage__?: Record<string, IJestFileCoverageData> } = {};
  const instrumented: string = instrumenter.instrumentSync(SOURCE, path.join(root, IDENTITY));
  new Script(`${instrumented}\nchoose(true); choose(false);`).runInNewContext(context);
  if (!context.__coverage__) {
    throw new Error('The instrumented fixture did not produce coverage.');
  }
  return createCoverageMap(context.__coverage__);
}

function createSources(text: string = SOURCE): Map<string, ICoverageSource> {
  return new Map([[IDENTITY, { text, hash: 'opaque-source-hash' }]]);
}

describe('coverage identities', () => {
  it('uses build-root-relative forward-slash identities', () => {
    expect(coverageIdentity(ROOT, path.join(ROOT, 'src', 'choose.js'))).toBe(IDENTITY);
    expect(coverageIdentity(ROOT, path.join(ROOT, '..inside', 'choose.js'))).toBe('..inside/choose.js');
  });

  it.each([
    '',
    '.',
    '..',
    '../outside.js',
    'src/../choose.js',
    './choose.js',
    'src//choose.js',
    'src/',
    '/choose.js',
    'C:/choose.js',
    'C:choose.js',
    '\\\\server\\share\\choose.js',
    'src\\choose.js',
    'choose.js:stream',
    'choose\0.js'
  ])('rejects a nonportable identity %j', (identity) => {
    expect(() => validateCoverageIdentity(identity)).toThrow('Invalid build-root-relative coverage identity');
  });

  it('rejects outside-root, root-only and relative paths', () => {
    for (const filename of [ROOT, path.join(ROOT, '..', 'outside.js'), 'src/choose.js']) {
      expect(() => coverageIdentity(ROOT, filename)).toThrow();
    }
    expect(() => coverageIdentity('relative-root', path.join(ROOT, IDENTITY))).toThrow('absolute');
  });
});

describe('portableCoverageMap', () => {
  it('round trips real Istanbul data without caches, class instances, lost counters or input mutations', () => {
    const map: CoverageMap = createMap();
    const original: IJestFileCoverageData = map.fileCoverageFor(path.join(ROOT, IDENTITY)).data;
    const before: IJestFileCoverageData = structuredClone(original);
    const sources: Map<string, ICoverageSource> = createSources();
    const sourcesBefore: [string, ICoverageSource][] = structuredClone([...sources]);
    const cache = { inputSourceMap: new Map([['filename', ROOT]]), sourceMapCache: () => ROOT };
    Object.assign(original, cache);

    const portable: Record<string, IJestFileCoverageData> = portableCoverageMap(map, ROOT, sources);
    expect(Object.keys(portable)).toEqual([IDENTITY]);
    expect(portable).toEqual(JSON.parse(JSON.stringify(portable)));
    expect(Object.getPrototypeOf(portable[IDENTITY])).toBe(Object.prototype);
    expect(portable[IDENTITY]).toEqual({
      path: IDENTITY,
      statementMap: before.statementMap,
      fnMap: before.fnMap,
      branchMap: JSON.parse(JSON.stringify(before.branchMap)),
      s: before.s,
      f: before.f,
      b: before.b,
      bT: before.bT
    });
    expect(Object.values(portable[IDENTITY].s).some((count) => count > 0)).toBe(true);
    expect(Object.values(portable[IDENTITY].b).some((counts) => counts.length === 2)).toBe(true);
    expect(Object.values(portable[IDENTITY].bT!).some((counts) => counts.some((count) => count > 0))).toBe(
      true
    );
    const implicitElse = Object.values(portable[IDENTITY].branchMap).find((branch) => branch.type === 'if')!;
    expect(implicitElse.locations[1]).toEqual({ start: {}, end: {} });
    expect(createCoverageMap(portable).getCoverageSummary().toJSON()).toEqual(
      map.getCoverageSummary().toJSON()
    );
    expect(original).toEqual({ ...before, ...cache });
    portable[IDENTITY].s[0] += 10;
    portable[IDENTITY].statementMap[0].start.column += 1;
    expect(original).toEqual({ ...before, ...cache });
    expect([...sources]).toEqual(sourcesBefore);
  });

  it.each([true, false])('preserves the all=%s baseline marker', (all) => {
    const filename: string = path.join(ROOT, IDENTITY);
    const data: IJestFileCoverageData = { ...createFileCoverage(filename).data, all };
    const portable: Record<string, IJestFileCoverageData> = portableCoverageMap(
      createCoverageMap({ [filename]: data }),
      ROOT,
      createSources()
    );
    expect(portable[IDENTITY].all).toBe(all);
    expect(createFileCoverage(portable[IDENTITY]).toJSON()).toEqual(portable[IDENTITY]);
  });

  it('produces the same map in different build roots and orders files deterministically', () => {
    const otherRoot: string = path.resolve(ROOT, '..', 'other-root');
    expect(portableCoverageMap(createMap(otherRoot), otherRoot, createSources())).toEqual(
      portableCoverageMap(createMap(), ROOT, createSources())
    );
    const map: CoverageMap = createMap();
    map.addFileCoverage(createFileCoverage(path.join(ROOT, 'a.js')));
    const sources: Map<string, ICoverageSource> = createSources();
    sources.set('a.js', { text: '', hash: '' });
    expect(Object.keys(portableCoverageMap(map, ROOT, sources))).toEqual(['a.js', IDENTITY]);
  });

  it.each(['\n', '\r\n', '\r'])(
    'resolves only positive-Infinity end columns using %j source lines',
    (newline) => {
      const map: CoverageMap = createMap();
      const original = map.fileCoverageFor(path.join(ROOT, IDENTITY)).data;
      const locations = [
        original.statementMap[0],
        original.fnMap[0].loc,
        original.fnMap[0].decl,
        original.branchMap[0].loc,
        original.branchMap[0].locations[0]
      ];
      for (const location of locations) {
        location.end = { line: 2, column: Number.POSITIVE_INFINITY };
      }
      // V8-derived coverage can legitimately contain negative, finite columns.
      original.fnMap[0].decl.start.column = -2;
      const before = structuredClone(original);
      const portable = portableCoverageMap(map, ROOT, createSources(`first${newline}second${newline}`))[
        IDENTITY
      ];
      for (const location of [
        portable.statementMap[0],
        portable.fnMap[0].loc,
        portable.fnMap[0].decl,
        portable.branchMap[0].loc,
        portable.branchMap[0].locations[0]
      ]) {
        expect(location.end).toEqual({ line: 2, column: 6 });
      }
      expect(portable.fnMap[0].decl.start.column).toBe(-2);
      expect(original).toEqual(before);
    }
  );

  it.each([0, -1, 1.5, 99, NaN, Infinity])(
    'rejects invalid sentinel line %s without mutating input',
    (line) => {
      const map: CoverageMap = createMap();
      const original = map.fileCoverageFor(path.join(ROOT, IDENTITY)).data;
      original.statementMap[0].end = { line, column: Number.POSITIVE_INFINITY };
      const before = structuredClone(original);
      expect(() => portableCoverageMap(map, ROOT, createSources())).toThrow(
        'Invalid coverage source-map line'
      );
      expect(original).toEqual(before);
    }
  );

  it.each([
    { text: '', line: 1, column: 0 },
    { text: 'first\n', line: 2, column: 0 },
    { text: '\t\uD83D\uDE00', line: 1, column: 3 }
  ])('uses original UTF-16 line length including empty lines (%j)', ({ text, line, column }) => {
    const map: CoverageMap = createMap();
    map.fileCoverageFor(path.join(ROOT, IDENTITY)).data.statementMap[0].end = {
      line,
      column: Number.POSITIVE_INFINITY
    };
    expect(portableCoverageMap(map, ROOT, createSources(text))[IDENTITY].statementMap[0].end).toEqual({
      line,
      column
    });
  });

  it.each([NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid counts (%s)',
    (value) => {
      for (const field of ['s', 'f', 'b', 'bT'] as const) {
        const map: CoverageMap = createMap();
        const data: IJestFileCoverageData = map.fileCoverageFor(path.join(ROOT, IDENTITY)).data;
        if (field === 's' || field === 'f') {
          data[field][0] = value;
        } else {
          Object.values(data[field]!)[0][0] = value;
        }
        const before = structuredClone(data);
        expect(() => portableCoverageMap(map, ROOT, createSources())).toThrow('Invalid coverage count');
        expect(data).toEqual(before);
      }
    }
  );

  it.each([NaN, Infinity, -Infinity])('rejects non-finite nonsentinel coordinates (%s)', (value) => {
    for (const field of ['start', 'end', 'line'] as const) {
      const map: CoverageMap = createMap();
      const data: IJestFileCoverageData = map.fileCoverageFor(path.join(ROOT, IDENTITY)).data;
      switch (field) {
        case 'start':
          data.statementMap[0].start.column = value;
          break;
        case 'end':
          if (value === Infinity) continue;
          data.statementMap[0].end.column = value;
          break;
        case 'line':
          data.statementMap[0].start.line = value;
          break;
      }
      expect(() => portableCoverageMap(map, ROOT, createSources())).toThrow('Non-finite coverage value');
    }
  });

  it('requires original source even without a sentinel, but permits an empty map', () => {
    expect(() => portableCoverageMap(createMap(), ROOT, new Map())).toThrow(
      'Missing original coverage source'
    );
    expect(portableCoverageMap(createCoverageMap({}), ROOT, new Map())).toEqual({});
  });

  it('rejects outside-root, mismatched and colliding file identities instead of dropping coverage', () => {
    const filename: string = path.join(ROOT, IDENTITY);
    const outside: string = path.resolve(ROOT, '..', 'outside.js');
    expect(() =>
      portableCoverageMap(
        createCoverageMap({ [outside]: createFileCoverage(outside) }),
        ROOT,
        createSources()
      )
    ).toThrow('Invalid build-root-relative coverage identity');
    expect(() =>
      portableCoverageMap(
        createCoverageMap({ [filename]: createFileCoverage(outside) }),
        ROOT,
        createSources()
      )
    ).toThrow('Coverage path does not match map entry');

    const map: CoverageMap = createMap();
    const alias: string = `${ROOT}${path.sep}src${path.sep}.${path.sep}choose.js`;
    map.addFileCoverage(createFileCoverage(alias));
    expect(() => portableCoverageMap(map, ROOT, createSources())).toThrow('Duplicate coverage identity');
  });
});
