// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { JsonFile } from '@rushstack/node-core-library';

import { tryParseJsonLean } from '../lean/LeanJson';

const REPO_ROOT: string = path.resolve(__dirname, '../../../../..');

// Compares two values exactly, including key order, property descriptors, prototypes and -0
function isExactlyEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }

  if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) {
    return false;
  }

  const aKeys: (string | symbol)[] = Reflect.ownKeys(a);
  const bKeys: (string | symbol)[] = Reflect.ownKeys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (let i: number = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) {
      return false;
    }

    const aDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(a, aKeys[i])!;
    const bDescriptor: PropertyDescriptor = Object.getOwnPropertyDescriptor(b, bKeys[i])!;
    if (
      aDescriptor.enumerable !== bDescriptor.enumerable ||
      aDescriptor.writable !== bDescriptor.writable ||
      aDescriptor.configurable !== bDescriptor.configurable ||
      !isExactlyEqual(aDescriptor.value, bDescriptor.value)
    ) {
      return false;
    }
  }

  return true;
}

type ReferenceResult = { value: unknown } | { error: string };

function parseWithReference(text: string): ReferenceResult {
  try {
    return { value: JsonFile.parseString(text) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Asserts the soundness contract: whenever the lean parser returns a result, the reference parser must succeed
 * with an identical result.
 */
function expectSound(text: string): { value: unknown } | undefined {
  const leanResult: { value: unknown } | undefined = tryParseJsonLean(text);
  if (leanResult) {
    const referenceResult: ReferenceResult = parseWithReference(text);
    if (!('value' in referenceResult) || !isExactlyEqual(leanResult.value, referenceResult.value)) {
      throw new Error(`Lean JSON parser is unsound for ${JSON.stringify(text)}`);
    }
  }

  return leanResult;
}

// A small deterministic PRNG, so that the fuzzing is reproducible
function createRandom(seed: number): () => number {
  let state: number = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function findConfigFiles(): string[] {
  const results: string[] = [];
  for (const topFolder of ['apps', 'build-tests', 'heft-plugins', 'rigs']) {
    const topFolderPath: string = path.join(REPO_ROOT, topFolder);
    if (!fs.existsSync(topFolderPath)) {
      continue;
    }

    for (const projectName of fs.readdirSync(topFolderPath)) {
      for (const relativePath of [
        'package.json',
        'heft-plugin.json',
        'config/heft.json',
        'config/rig.json',
        'config/typescript.json'
      ]) {
        const filePath: string = path.join(topFolderPath, projectName, relativePath);
        if (fs.existsSync(filePath)) {
          results.push(filePath);
        }
      }
    }
  }

  return results;
}

describe('LeanJson', () => {
  it('matches JsonFile.parseString() for plain JSON and JSON with comments and trailing commas', () => {
    const cases: [string, unknown][] = [
      ['{}', {}],
      ['[]', []],
      ['{"a": 1, "b": [true, false, null], "c": {"d": "e"}}', { a: 1, b: [true, false, null], c: { d: 'e' } }],
      ['// comment\n{"a": 1}', { a: 1 }],
      ['{"a": /* inline */ 1}', { a: 1 }],
      ['{"a": 1, // trailing\n}', { a: 1 }],
      ['{"a": [1, 2, /* x */ ], }', { a: [1, 2] }],
      [
        '{"url": "https://example.com/a//b", "glob": "src/**/*.ts"}',
        { url: 'https://example.com/a//b', glob: 'src/**/*.ts' }
      ],
      ['{"a": "/* not a comment */", "b": "// nor this"}', { a: '/* not a comment */', b: '// nor this' }],
      ['{"escaped": "quote \\" // still a string"}', { escaped: 'quote " // still a string' }],
      ['{"a": 1, "a": 2}', { a: 2 }],
      ['{"n": -0}', { n: -0 }],
      ['{"big": 1e400}', { big: Infinity }],
      ['"just a string"', 'just a string'],
      ['\r\n{\r\n  "a": 1\r\n}\r\n', { a: 1 }]
    ];
    for (const [text, expected] of cases) {
      const result: { value: unknown } | undefined = expectSound(text);
      expect(result).toBeDefined();
      expect(result!.value).toEqual(expected);
    }

    // __proto__ is an own data property with both parsers
    const protoResult: { value: unknown } | undefined = expectSound('{"__proto__": {"polluted": true}}');
    expect(protoResult).toBeDefined();
    expect(Object.getPrototypeOf(protoResult!.value)).toBe(Object.prototype);
    expect(Object.keys(protoResult!.value as object)).toEqual(['__proto__']);
  });

  it('bails out for JSON5 features and syntax errors', () => {
    const bailCases: string[] = [
      "{'a': 1}",
      '{a: 1}',
      '{"a": 0x10}',
      '{"a": .5}',
      '{"a": +1}',
      '{"a": Infinity}',
      '{"a": NaN}',
      '\ufeff{"a": 1}',
      '{"a": "line\u2028separator"}',
      '{"a": 1} // comment\u2028 , "b": 2}',
      '{"a": "continued \\\n line"}',
      '[,]',
      '{,}',
      '[1,,]',
      '{"a": 1,,}',
      '{"a": 1 /* unterminated',
      '{"a": "unterminated',
      '{"a": 1}}',
      '',
      '// only a comment',
      '{"a": 1 2}',
      '1/*x*/2',
      '{"a"\u00a0: 1}'
    ];
    for (const text of bailCases) {
      expect(expectSound(text)).toBeUndefined();
    }
  });

  it('matches JsonFile.parseString() for every config file in the repo', () => {
    const files: string[] = findConfigFiles();
    let parsedCount: number = 0;
    for (const filePath of files) {
      if (expectSound(fs.readFileSync(filePath, 'utf8'))) {
        parsedCount++;
      }
    }

    // The fast path should handle essentially all real config files
    expect(parsedCount).toBeGreaterThan(files.length * 0.95);
  });

  it('is sound for randomly mutated config files', () => {
    const files: string[] = findConfigFiles().slice(0, 200);
    const texts: string[] = files.map((filePath: string) => fs.readFileSync(filePath, 'utf8').slice(0, 3000));
    const insertions: string[] = [
      '//x\n',
      '/* c */',
      '/*',
      '*/',
      '//',
      ',',
      ',,',
      ' ,]',
      ',}',
      '"',
      "'",
      '\\',
      '\\\n',
      '\u2028',
      '\ufeff',
      '\t',
      '\v',
      'NaN',
      '0x1F',
      '.5',
      '-0',
      '01',
      '"__proto__":1,',
      '"a":1,"a":2,',
      '[,]',
      '"//"',
      '"/*"',
      "'a'",
      'a:1,',
      '\r',
      '/**/',
      '// */\n'
    ];
    const random: () => number = createRandom(42);
    for (let i: number = 0; i < 3000 && texts.length > 0; i++) {
      let text: string = texts[Math.floor(random() * texts.length)];
      const insertionCount: number = 1 + Math.floor(random() * 3);
      for (let j: number = 0; j < insertionCount; j++) {
        const position: number = Math.floor(random() * (text.length + 1));
        text =
          text.slice(0, position) + insertions[Math.floor(random() * insertions.length)] + text.slice(position);
      }

      expectSound(text);
    }
  });
});
