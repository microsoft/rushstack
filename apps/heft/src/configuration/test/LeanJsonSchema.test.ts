// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { JsonFile, JsonSchema } from '@rushstack/node-core-library';

import { isDefinitelyValid, isSchemaSupported } from '../lean/LeanJsonSchema';

const SCHEMAS_FOLDER: string = path.resolve(__dirname, '../../schemas');
const REPO_ROOT: string = path.resolve(__dirname, '../../../../..');

interface IReferenceResult {
  compiledWithoutWarnings: boolean;
  valid: boolean[];
}

/**
 * Validates with the original implementation (ajv via node-core-library), capturing anything that ajv logs.
 */
function validateWithReference(schemaObject: object, dataList: unknown[]): IReferenceResult {
  const logged: unknown[][] = [];
  const spies: jest.SpyInstance[] = (['log', 'warn', 'error'] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args);
    })
  );
  let jsonSchema: JsonSchema | undefined;
  try {
    jsonSchema = JsonSchema.fromLoadedObject(JSON.parse(JSON.stringify(schemaObject)));
    jsonSchema.ensureCompiled();
  } catch {
    jsonSchema = undefined;
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }

  return {
    compiledWithoutWarnings: !!jsonSchema && logged.length === 0,
    valid: dataList.map((data: unknown) => {
      if (!jsonSchema) {
        return false;
      }

      try {
        jsonSchema.validateObject(data as object, '');
        return true;
      } catch {
        return false;
      }
    })
  };
}

/**
 * Asserts the soundness contract of the lean validator against the reference, and returns the lean verdicts.
 */
function expectSound(schemaObject: object, dataList: unknown[]): boolean[] {
  const reference: IReferenceResult = validateWithReference(schemaObject, dataList);
  if (isSchemaSupported(schemaObject) && !reference.compiledWithoutWarnings) {
    throw new Error(`Schema is supported, but ajv throws or logs: ${JSON.stringify(schemaObject)}`);
  }

  return dataList.map((data: unknown, i: number) => {
    const leanValid: boolean = isDefinitelyValid(schemaObject, data);
    if (leanValid && !reference.valid[i]) {
      throw new Error(
        `Unsound verdict for schema ${JSON.stringify(schemaObject)} and data ${JSON.stringify(data)}`
      );
    }

    return leanValid;
  });
}

function createRandom(seed: number): () => number {
  let state: number = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const DRAFT_04: string = 'http://json-schema.org/draft-04/schema#';
const DRAFT_07: string = 'http://json-schema.org/draft-07/schema#';

describe('LeanJsonSchema', () => {
  it('supports all schemas that ship with Heft', () => {
    for (const fileName of fs.readdirSync(SCHEMAS_FOLDER)) {
      if (fileName.endsWith('.schema.json')) {
        const schemaObject: object = JsonFile.load(path.join(SCHEMAS_FOLDER, fileName));
        expect([fileName, isSchemaSupported(schemaObject)]).toEqual([fileName, true]);
        expect([fileName, validateWithReference(schemaObject, []).compiledWithoutWarnings]).toEqual([
          fileName,
          true
        ]);
      }
    }
  });

  it('never accepts a schema that ajv rejects or warns about', () => {
    const cases: object[] = [
      // strictSchema: unknown keywords
      { $schema: DRAFT_04, type: 'object', unknownKeyword: true },
      { $schema: DRAFT_04, type: 'object', examples: [] },
      { type: 'object', id: 'x' },
      // strictTypes: missing types / types not allowed by the context
      { $schema: DRAFT_04, properties: { a: { type: 'string' } } },
      { $schema: DRAFT_04, type: 'string', minItems: 1 },
      { $schema: DRAFT_04, type: 'object', anyOf: [{ type: 'string' }] },
      { $schema: DRAFT_04, type: 'object', properties: { a: { pattern: '^a' } } },
      // strictTuples
      { $schema: DRAFT_07, type: 'array', items: [{ type: 'string' }] },
      // meta-schema violations
      { $schema: DRAFT_04, type: 'object', required: [] },
      { $schema: DRAFT_04, enum: ['a', 'a'] },
      { $schema: DRAFT_04, type: 'string', minLength: -1 },
      { $schema: DRAFT_04, type: 'nope' },
      { $schema: DRAFT_04, type: 'number', maximum: 1, exclusiveMaximum: true },
      { $schema: DRAFT_04, type: 'object', description: 1 },
      // regular expressions
      { $schema: DRAFT_04, type: 'string', pattern: '(' },
      { $schema: DRAFT_04, type: 'string', pattern: 'a\\Z' },
      // properties that match patternProperties
      {
        $schema: DRAFT_04,
        type: 'object',
        properties: { abc: { type: 'string' } },
        patternProperties: { '^a': { type: 'string' } }
      },
      // references
      { $schema: DRAFT_04, $ref: '#/definitions/missing' },
      { $schema: DRAFT_04, $ref: 'http://example.com/schema.json' },
      // formats and unsupported meta-schemas
      { $schema: DRAFT_04, type: 'string', format: 'uri' },
      { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' },
      // prototype property names
      { $schema: DRAFT_04, type: 'object', required: ['constructor'] }
    ];
    for (const schemaObject of cases) {
      expect([schemaObject, isSchemaSupported(schemaObject)]).toEqual([schemaObject, false]);
      expectSound(schemaObject, [{}, 'a', 1, []]);
    }
  });

  it('matches ajv for supported keywords', () => {
    const schemaObject: object = {
      $schema: DRAFT_04,
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      definitions: {
        tag: { type: 'string', pattern: '^[a-z]+$', minLength: 2, maxLength: 5 }
      },
      properties: {
        name: { type: 'string', enum: ['a', 'b'] },
        count: { type: 'integer', minimum: 1, maximum: 3 },
        tags: { type: 'array', items: { $ref: '#/definitions/tag' }, uniqueItems: true, minItems: 1 },
        mode: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        either: { anyOf: [{ type: 'string' }, { type: 'boolean' }], not: { enum: [false] } },
        both: { type: 'object', allOf: [{ required: ['x'] }, { required: ['y'] }] },
        fixed: { const: { a: [1, 'b'] } }
      },
      patternProperties: {
        '^x-': { type: 'number' }
      }
    };
    const dataList: unknown[] = [
      { name: 'a' },
      { name: 'c' },
      {},
      { name: 'a', extra: 1 },
      { name: 'a', 'x-1': 1 },
      { name: 'a', 'x-1': 'one' },
      { name: 'a', count: 2 },
      { name: 'a', count: 2.5 },
      { name: 'a', count: 4 },
      { name: 'a', tags: ['abc', 'de'] },
      { name: 'a', tags: ['abc', 'abc'] },
      { name: 'a', tags: [] },
      { name: 'a', tags: ['toolong'] },
      { name: 'a', tags: ['ab1'] },
      { name: 'a', tags: ['\ud83d\ude00\ud83d\ude00'] },
      { name: 'a', mode: 'x' },
      { name: 'a', mode: null },
      { name: 'a', either: true },
      { name: 'a', either: false },
      { name: 'a', either: 1 },
      { name: 'a', both: { x: 1, y: 2 } },
      { name: 'a', both: { x: 1 } },
      { name: 'a', fixed: { a: [1, 'b'] } },
      { name: 'a', fixed: { a: [1, 'c'] } }
    ];
    const leanVerdicts: boolean[] = expectSound(schemaObject, dataList);
    const referenceVerdicts: boolean[] = validateWithReference(schemaObject, dataList).valid;
    // For supported schemas and simple JSON data, the verdicts are identical
    expect(leanVerdicts).toEqual(referenceVerdicts);
    expect(leanVerdicts.filter((x) => x).length).toBeGreaterThan(5);
  });

  it('defers for data that is not simple JSON', () => {
    const schemaObject: object = { $schema: DRAFT_04, type: 'object' };
    expect(isDefinitelyValid(schemaObject, {})).toBe(true);
    expect(isDefinitelyValid(schemaObject, Object.create(null))).toBe(false);
    expect(isDefinitelyValid(schemaObject, { a: NaN })).toBe(false);
    expect(isDefinitelyValid(schemaObject, { a: undefined })).toBe(false);
    expect(isDefinitelyValid(schemaObject, { a: () => 1 })).toBe(false);
    expect(isDefinitelyValid(schemaObject, JSON.parse('{"__proto__": {}}'))).toBe(false);
    expect(isDefinitelyValid(schemaObject, { toString: 'x' })).toBe(false);
  });

  it('is sound for the config files in the repo and mutations of them', () => {
    const random: () => number = createRandom(1234);
    const pick: <T>(values: T[]) => T = <T>(values: T[]) => values[Math.floor(random() * values.length)];
    const primitives: unknown[] = [null, true, false, 0, 1, -1, 1.5, '', 'x', 'build', '--foo', '-x', '.js', [], {}];

    function mutate(value: unknown, depth: number): unknown {
      if (depth > 5) {
        return value;
      }

      if (Array.isArray(value)) {
        const result: unknown[] = value.slice();
        if (result.length && random() < 0.3) {
          result.splice(Math.floor(random() * result.length), 1);
        }

        if (result.length && random() < 0.5) {
          const i: number = Math.floor(random() * result.length);
          result[i] = mutate(result[i], depth + 1);
        }

        return random() < 0.1 ? pick(primitives) : result;
      }

      if (value && typeof value === 'object') {
        const result: Record<string, unknown> = { ...(value as Record<string, unknown>) };
        const keys: string[] = Object.keys(result);
        if (keys.length && random() < 0.25) {
          delete result[pick(keys)];
        }

        if (random() < 0.15) {
          result[pick(['extra', 'pluginName', 'options', 'required', 'longName', 'build'])] = pick(primitives);
        }

        if (keys.length && random() < 0.6) {
          const key: string = pick(keys);
          result[key] = mutate(result[key], depth + 1);
        }

        return random() < 0.1 ? pick(primitives) : result;
      }

      return random() < 0.5 ? pick(primitives) : value;
    }

    const samplesBySchema: Map<string, unknown[]> = new Map([
      ['heft.schema.json', []],
      ['heft-plugin.schema.json', []]
    ]);
    for (const topFolder of ['apps', 'build-tests', 'heft-plugins', 'rigs']) {
      const topFolderPath: string = path.join(REPO_ROOT, topFolder);
      if (!fs.existsSync(topFolderPath)) {
        continue;
      }

      for (const projectName of fs.readdirSync(topFolderPath)) {
        const heftJsonPath: string = path.join(topFolderPath, projectName, 'config/heft.json');
        if (fs.existsSync(heftJsonPath)) {
          samplesBySchema.get('heft.schema.json')!.push(JsonFile.load(heftJsonPath));
        }

        const heftPluginJsonPath: string = path.join(topFolderPath, projectName, 'heft-plugin.json');
        if (fs.existsSync(heftPluginJsonPath)) {
          samplesBySchema.get('heft-plugin.schema.json')!.push(JsonFile.load(heftPluginJsonPath));
        }
      }
    }

    for (const [schemaFileName, samples] of samplesBySchema) {
      const schemaObject: object = JsonFile.load(path.join(SCHEMAS_FOLDER, schemaFileName));
      const dataList: unknown[] = [...samples];
      for (const sample of samples) {
        for (let i: number = 0; i < 20; i++) {
          dataList.push(mutate(JSON.parse(JSON.stringify(sample)), 0));
        }
      }

      const leanVerdicts: boolean[] = expectSound(schemaObject, dataList);
      // For the real config files (some of which are only valid after merging with the file that they extend),
      // the verdicts are identical to ajv's, i.e. all valid files take the fast path
      const referenceVerdicts: boolean[] = validateWithReference(schemaObject, samples).valid;
      expect(leanVerdicts.slice(0, samples.length)).toEqual(referenceVerdicts);
      expect(referenceVerdicts.filter((x) => x).length).toBeGreaterThan(samples.length / 2);
    }
  });

  it('is sound for randomly generated schemas', () => {
    const random: () => number = createRandom(99);
    const pick: <T>(values: T[]) => T = <T>(values: T[]) => values[Math.floor(random() * values.length)];
    const types: string[] = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];

    function generateSchema(depth: number, withType: boolean): Record<string, unknown> {
      const schema: Record<string, unknown> = {};
      const type: string = pick(types);
      if (withType || random() < 0.7) {
        schema.type = random() < 0.15 ? [type, pick(types)] : type;
      }

      const r: number = random();
      if (type === 'object' && r < 0.8) {
        schema.properties = { a: generateSchema(depth + 1, true), b: generateSchema(depth + 1, random() < 0.8) };
        if (random() < 0.5) {
          schema.required = random() < 0.5 ? ['a'] : ['a', 'b'];
        }

        if (random() < 0.5) {
          schema.additionalProperties = random() < 0.6 ? false : generateSchema(depth + 1, true);
        }

        if (random() < 0.3) {
          schema.patternProperties = { [pick(['^x', '^[0-9]+$', 'b'])]: generateSchema(depth + 1, true) };
        }

        if (random() < 0.3) {
          schema.anyOf = [{ required: ['a'] }, { required: ['c'] }];
        }
      } else if (type === 'array' && r < 0.8) {
        schema.items = generateSchema(depth + 1, true);
        if (random() < 0.4) {
          schema.minItems = Math.floor(random() * 3);
        }

        if (random() < 0.4) {
          schema.uniqueItems = true;
        }
      } else if (type === 'string' && r < 0.8) {
        if (random() < 0.5) {
          schema.pattern = pick(['^a', 'b$', '^[a-z]+$', '\\d', '^.{2,}$']);
        }

        if (random() < 0.4) {
          schema.enum = ['a', 'ab', pick(['x', 'b'])];
        }

        if (random() < 0.3) {
          schema.maxLength = Math.floor(random() * 4);
        }
      } else if ((type === 'number' || type === 'integer') && r < 0.8) {
        schema.minimum = pick([0, 1, -1]);
        if (random() < 0.5) {
          schema.maximum = pick([2, 10]);
        }
      } else if (depth < 3) {
        schema[pick(['anyOf', 'oneOf', 'allOf'])] = [generateSchema(depth + 1, true), generateSchema(depth + 1, true)];
      }

      if (depth < 3 && random() < 0.1) {
        schema.not = generateSchema(depth + 1, true);
      }

      return schema;
    }

    function generateData(depth: number): unknown {
      const r: number = random();
      if (depth > 3 || r < 0.45) {
        return pick([null, true, false, 0, 1, 2, -1, 1.5, 11, 'a', 'b', 'ab', 'abc', '', '1', 'x1', 'é']);
      }

      if (r < 0.75) {
        const result: Record<string, unknown> = {};
        for (const key of ['a', 'b', 'c', 'x1', '12']) {
          if (random() < 0.45) {
            result[key] = generateData(depth + 1);
          }
        }

        return result;
      }

      const result: unknown[] = [];
      const length: number = Math.floor(random() * 4);
      for (let i: number = 0; i < length; i++) {
        result.push(i > 0 && random() < 0.3 ? result[0] : generateData(depth + 1));
      }

      return result;
    }

    let fastPathCount: number = 0;
    for (let i: number = 0; i < 150; i++) {
      const schemaObject: Record<string, unknown> = generateSchema(0, true);
      schemaObject.$schema = random() < 0.5 ? DRAFT_04 : DRAFT_07;
      const dataList: unknown[] = [];
      for (let j: number = 0; j < 20; j++) {
        dataList.push(generateData(0));
      }

      fastPathCount += expectSound(schemaObject, dataList).filter((x) => x).length;
    }

    expect(fastPathCount).toBeGreaterThan(100);
  });
});
