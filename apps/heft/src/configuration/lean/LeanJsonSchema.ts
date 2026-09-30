// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A lean, *sound* fast path for JSON schema validation.
 *
 * Heft validates `heft.json`, every `heft-plugin.json`, and every plugin's options using `JsonSchema` from
 * `@rushstack/node-core-library`, which compiles each schema with ajv (`strictSchema: true, allowUnionTypes: true`,
 * using `ajv-draft-04` for draft-04 schemas). Compiling the schemas dominates Heft's startup time.
 *
 * This module answers a single question: "would ajv compile this schema without any error or warning, and accept
 * this data?" It only returns `true` when it can prove that the answer is yes. In every other case (unsupported
 * keyword, anything ajv's strict mode would log or reject, unusual data, or simply invalid data) it returns `false`,
 * and the caller must fall back to the real `JsonSchema` validation, which produces the canonical behavior and
 * error messages.
 *
 * The supported subset intentionally mirrors ajv's semantics rather than the JSON schema specification where the
 * two differ (for example, keywords next to `$ref` are applied, and `required`/`properties` use `data[key] !==
 * undefined`).
 */

type JsonSchemaDraft = 'draft-04' | 'draft-07';

type JsonTypeName = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';

interface ISchemaObject {
  [key: string]: unknown;
}

interface ISchemaPlan {
  readonly root: ISchemaObject;
  readonly regExpCache: Map<string, RegExp>;
  readonly refTargets: Map<string, ISchemaObject>;
}

const JSON_TYPE_NAMES: ReadonlySet<string> = new Set<JsonTypeName>([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string'
]);

// See JsonSchema.ts in @rushstack/node-core-library
const VENDOR_EXTENSION_KEY_PATTERN: RegExp = /^x-[a-z0-9]+-[a-z0-9]+(-[a-z0-9]+)*$/;

// ajv-formats' "regex" format rejects patterns that use the unsupported "\Z" anchor
const Z_ANCHOR_REGEXP: RegExp = /[^\\]\\Z/;

const SIMPLE_DEFINITION_REF_REGEXP: RegExp = /^#\/definitions\/([A-Za-z0-9_.-]+)$/;

/**
 * The data type(s) that each type-specific keyword applies to (ajv's keyword definitions). Used to replicate ajv's
 * `strictTypes` checks.
 */
const KEYWORD_APPLICABLE_TYPE: ReadonlyMap<string, JsonTypeName> = new Map<string, JsonTypeName>([
  ['properties', 'object'],
  ['patternProperties', 'object'],
  ['additionalProperties', 'object'],
  ['required', 'object'],
  ['minProperties', 'object'],
  ['maxProperties', 'object'],
  ['items', 'array'],
  ['minItems', 'array'],
  ['maxItems', 'array'],
  ['uniqueItems', 'array'],
  ['minLength', 'string'],
  ['maxLength', 'string'],
  ['pattern', 'string'],
  ['minimum', 'number'],
  ['maximum', 'number'],
  ['exclusiveMinimum', 'number'],
  ['exclusiveMaximum', 'number']
]);

const planCache: WeakMap<object, ISchemaPlan | false> = new WeakMap();

class UnsupportedSchemaError extends Error {}

function unsupported(): never {
  throw new UnsupportedSchemaError();
}

function isPlainObject(value: unknown): value is ISchemaObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && isFinite(value);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Checks that the value is JSON data that the validator can reason about exactly: `null`, booleans, finite numbers,
 * strings, dense arrays, and objects with the standard prototype and without an own `__proto__` key.
 * Symbol-keyed properties (such as configuration file annotations) are ignored, like they are by ajv.
 */
function isSimpleJsonData(value: unknown, depth: number): boolean {
  if (depth > 256) {
    return false;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return isFinite(value);
    case 'object': {
      if (value === null) {
        return true;
      }

      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
          return false;
        }

        for (let i: number = 0; i < value.length; i++) {
          if (!(i in value) || !isSimpleJsonData(value[i], depth + 1)) {
            return false;
          }
        }

        return true;
      }

      if (
        Object.getPrototypeOf(value) !== Object.prototype ||
        // These own keys change the behavior of ajv's generated code or of fast-deep-equal
        hasOwn(value, '__proto__') ||
        hasOwn(value, 'constructor') ||
        hasOwn(value, 'valueOf') ||
        hasOwn(value, 'toString')
      ) {
        return false;
      }

      for (const key in value) {
        if (hasOwn(value, key)) {
          if (!isSimpleJsonData((value as Record<string, unknown>)[key], depth + 1)) {
            return false;
          }
        } else {
          // Inherited enumerable property
          return false;
        }
      }

      return true;
    }
    default:
      return false;
  }
}

/**
 * Deep equality with the semantics of `fast-deep-equal` (used by ajv), restricted to simple JSON data.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) {
      return false;
    }

    if (Array.isArray(a)) {
      const bArray: unknown[] = b as unknown[];
      if (a.length !== bArray.length) {
        return false;
      }

      for (let i: number = 0; i < a.length; i++) {
        if (!deepEqual(a[i], bArray[i])) {
          return false;
        }
      }

      return true;
    }

    const aKeys: string[] = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) {
      return false;
    }

    for (const key of aKeys) {
      if (!hasOwn(b, key)) {
        return false;
      }
    }

    for (const key of aKeys) {
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function getSchemaTypes(schema: ISchemaObject): JsonTypeName[] {
  const type: unknown = schema.type;
  if (type === undefined) {
    return [];
  }

  return (Array.isArray(type) ? type : [type]) as JsonTypeName[];
}

// Replicates ajv's includesType()
function includesType(types: JsonTypeName[], type: JsonTypeName): boolean {
  return types.includes(type) || (type === 'integer' && types.includes('number'));
}

// Replicates ajv's hasApplicableType()
function hasApplicableType(schemaTypes: JsonTypeName[], keywordType: JsonTypeName): boolean {
  return schemaTypes.includes(keywordType) || (keywordType === 'number' && schemaTypes.includes('integer'));
}

class SchemaAnalyzer {
  private readonly _root: ISchemaObject;
  private readonly _draft: JsonSchemaDraft;
  private readonly _vendorKeywords: ReadonlySet<string>;
  private readonly _regExpCache: Map<string, RegExp> = new Map();
  private readonly _refTargets: Map<string, ISchemaObject> = new Map();
  // Schema objects analyzed with an empty type context (the root, $ref targets and definitions)
  private readonly _analyzedWithEmptyContext: Set<ISchemaObject> = new Set();

  public constructor(root: ISchemaObject, draft: JsonSchemaDraft) {
    this._root = root;
    this._draft = draft;
    const vendorKeywords: Set<string> = new Set();
    for (const key of Object.keys(root)) {
      if (VENDOR_EXTENSION_KEY_PATTERN.test(key)) {
        vendorKeywords.add(key);
      }
    }

    this._vendorKeywords = vendorKeywords;
  }

  public analyze(): ISchemaPlan {
    this._analyzeSchema(this._root, [], true);
    return { root: this._root, regExpCache: this._regExpCache, refTargets: this._refTargets };
  }

  private _getRegExp(pattern: unknown): RegExp {
    if (typeof pattern !== 'string') {
      unsupported();
    }

    let regExp: RegExp | undefined = this._regExpCache.get(pattern);
    if (!regExp) {
      if (Z_ANCHOR_REGEXP.test(pattern)) {
        unsupported();
      }

      try {
        // ajv uses the "u" flag (unicodeRegExp: true)
        regExp = new RegExp(pattern, 'u');
      } catch {
        unsupported();
      }

      this._regExpCache.set(pattern, regExp);
    }

    return regExp;
  }

  private _resolveRef(ref: unknown): ISchemaObject {
    if (typeof ref !== 'string') {
      unsupported();
    }

    let target: ISchemaObject | undefined = this._refTargets.get(ref);
    if (target) {
      return target;
    }

    if (ref === '#') {
      this._refTargets.set(ref, this._root);
      return this._root;
    }

    const match: RegExpExecArray | null = SIMPLE_DEFINITION_REF_REGEXP.exec(ref);
    if (!match) {
      unsupported();
    }

    const definitions: unknown = this._root.definitions;
    if (!isPlainObject(definitions) || !hasOwn(definitions, match[1])) {
      unsupported();
    }

    const definition: unknown = definitions[match[1]];
    if (!isPlainObject(definition)) {
      unsupported();
    }

    target = definition;
    this._refTargets.set(ref, target);
    return target;
  }

  private _analyzeSubschema(schema: unknown, contextTypes: JsonTypeName[]): void {
    if (!isPlainObject(schema)) {
      // Boolean schemas are not supported by draft-04, and are not used by Heft
      unsupported();
    }

    this._analyzeSchema(schema, contextTypes, false);
  }

  private _analyzeWithEmptyContext(schema: ISchemaObject): void {
    if (!this._analyzedWithEmptyContext.has(schema)) {
      this._analyzedWithEmptyContext.add(schema);
      this._analyzeSchema(schema, [], schema === this._root);
    }
  }

  private _analyzeSchema(schema: ISchemaObject, contextTypes: JsonTypeName[], isRoot: boolean): void {
    if (isRoot) {
      this._analyzedWithEmptyContext.add(schema);
    }

    const draft: JsonSchemaDraft = this._draft;
    let hasRuleOtherThanRef: boolean = false;

    for (const key of Object.keys(schema)) {
      const value: unknown = schema[key];
      if (key !== '$ref') {
        hasRuleOtherThanRef = true;
      }

      switch (key) {
        case '$schema': {
          if (!isRoot) {
            unsupported();
          }

          break;
        }

        case 'title':
        case 'description':
        case '$comment': {
          if (typeof value !== 'string') {
            unsupported();
          }

          break;
        }

        case 'default': {
          break;
        }

        case 'examples': {
          if (draft !== 'draft-07' || !Array.isArray(value)) {
            unsupported();
          }

          break;
        }

        case 'definitions': {
          if (!isPlainObject(value)) {
            unsupported();
          }

          for (const definitionName of Object.keys(value)) {
            const definition: unknown = value[definitionName];
            if (!isPlainObject(definition)) {
              unsupported();
            }

            this._analyzeWithEmptyContext(definition);
          }

          break;
        }

        case 'type': {
          const types: unknown[] = Array.isArray(value) ? value : [value];
          if (types.length === 0 || new Set(types).size !== types.length) {
            unsupported();
          }

          for (const type of types) {
            if (typeof type !== 'string' || !JSON_TYPE_NAMES.has(type)) {
              unsupported();
            }
          }

          break;
        }

        case 'enum': {
          if (!Array.isArray(value) || value.length === 0 || !isSimpleJsonData(value, 0)) {
            unsupported();
          }

          for (let i: number = 0; i < value.length; i++) {
            for (let j: number = i + 1; j < value.length; j++) {
              if (deepEqual(value[i], value[j])) {
                unsupported();
              }
            }
          }

          break;
        }

        case 'const': {
          if (!isSimpleJsonData(value, 0)) {
            unsupported();
          }

          break;
        }

        case 'properties': {
          if (!isPlainObject(value)) {
            unsupported();
          }

          for (const propertyName of Object.keys(value)) {
            if (propertyName in Object.prototype) {
              // Includes "__proto__"; ajv's handling of these property names is unusual
              unsupported();
            }

            this._analyzeSubschema(value[propertyName], []);
          }

          break;
        }

        case 'patternProperties': {
          if (!isPlainObject(value)) {
            unsupported();
          }

          for (const pattern of Object.keys(value)) {
            if (pattern === '__proto__') {
              unsupported();
            }

            this._getRegExp(pattern);
            this._analyzeSubschema(value[pattern], []);
          }

          break;
        }

        case 'additionalProperties': {
          if (typeof value !== 'boolean') {
            this._analyzeSubschema(value, []);
          }

          break;
        }

        case 'required': {
          if (!Array.isArray(value) || (draft === 'draft-04' && value.length === 0)) {
            unsupported();
          }

          const seen: Set<unknown> = new Set();
          for (const propertyName of value) {
            if (typeof propertyName !== 'string' || seen.has(propertyName) || propertyName in Object.prototype) {
              unsupported();
            }

            seen.add(propertyName);
          }

          break;
        }

        case 'items': {
          // The array form (tuple validation) is not supported
          this._analyzeSubschema(value, []);
          break;
        }

        case 'minItems':
        case 'maxItems':
        case 'minLength':
        case 'maxLength':
        case 'minProperties':
        case 'maxProperties': {
          if (!isNonNegativeInteger(value)) {
            unsupported();
          }

          break;
        }

        case 'uniqueItems': {
          if (typeof value !== 'boolean') {
            unsupported();
          }

          break;
        }

        case 'pattern': {
          this._getRegExp(value);
          break;
        }

        case 'minimum':
        case 'maximum': {
          if (!isFiniteNumber(value)) {
            unsupported();
          }

          break;
        }

        case 'exclusiveMinimum':
        case 'exclusiveMaximum': {
          // draft-04 uses a boolean modifier, which is not supported
          if (draft !== 'draft-07' || !isFiniteNumber(value)) {
            unsupported();
          }

          break;
        }

        case 'allOf':
        case 'anyOf':
        case 'oneOf': {
          // These are validated in place, so the subschemas inherit the type context; this is handled below
          if (!Array.isArray(value) || value.length === 0) {
            unsupported();
          }

          break;
        }

        case 'not': {
          // Validated in place; handled below
          break;
        }

        case '$ref': {
          this._analyzeWithEmptyContext(this._resolveRef(value));
          break;
        }

        default: {
          if (!this._vendorKeywords.has(key)) {
            // Unknown or unsupported keyword
            unsupported();
          }

          break;
        }
      }
    }

    // ajv's strict mode rejects a property that also matches a pattern property (allowMatchingProperties: false)
    const properties: unknown = schema.properties;
    const patternProperties: unknown = schema.patternProperties;
    if (isPlainObject(properties) && isPlainObject(patternProperties)) {
      for (const pattern of Object.keys(patternProperties)) {
        const regExp: RegExp = this._getRegExp(pattern);
        for (const propertyName of Object.keys(properties)) {
          if (regExp.test(propertyName)) {
            unsupported();
          }
        }
      }
    }

    let dataTypes: JsonTypeName[] = contextTypes;
    if (schema.$ref !== undefined && !hasRuleOtherThanRef) {
      // ajv only evaluates the $ref, and skips the strictTypes checks for this schema object
      return;
    }

    // Replicate ajv's checkStrictTypes() (strictTypes: "log"). Any warning means the schema is not supported,
    // so that the real ajv path logs it.
    const types: JsonTypeName[] = getSchemaTypes(schema);
    if (types.length) {
      if (!contextTypes.length) {
        dataTypes = types;
      } else {
        for (const type of types) {
          if (!includesType(contextTypes, type)) {
            unsupported();
          }
        }

        // Replicates ajv's narrowSchemaTypes()
        const narrowedTypes: JsonTypeName[] = [];
        for (const contextType of contextTypes) {
          if (includesType(types, contextType)) {
            narrowedTypes.push(contextType);
          } else if (types.includes('integer') && contextType === 'number') {
            narrowedTypes.push('integer');
          }
        }

        dataTypes = narrowedTypes;
      }
    }

    for (const key of Object.keys(schema)) {
      const applicableType: JsonTypeName | undefined = KEYWORD_APPLICABLE_TYPE.get(key);
      if (applicableType && !hasApplicableType(dataTypes, applicableType)) {
        unsupported();
      }
    }

    // In-place applicators inherit the (narrowed) type context
    for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
      const subschemas: unknown = schema[key];
      if (subschemas !== undefined) {
        for (const subschema of subschemas as unknown[]) {
          this._analyzeSubschema(subschema, dataTypes);
        }
      }
    }

    if (schema.not !== undefined) {
      this._analyzeSubschema(schema.not, dataTypes);
    }
  }
}

function getSchemaDraft(schema: ISchemaObject): JsonSchemaDraft | undefined {
  // Mirrors _inferJsonSchemaVersion() in JsonSchema.ts, restricted to the meta-schema URLs that ajv resolves.
  const $schema: unknown = schema.$schema;
  switch ($schema) {
    case undefined:
    case 'http://json-schema.org/draft-07/schema#':
    case 'http://json-schema.org/draft-07/schema':
      return 'draft-07';
    case 'http://json-schema.org/draft-04/schema#':
    case 'http://json-schema.org/draft-04/schema':
      return 'draft-04';
    default:
      return undefined;
  }
}

function getSchemaPlan(schemaObject: object): ISchemaPlan | undefined {
  let plan: ISchemaPlan | false | undefined = planCache.get(schemaObject);
  if (plan === undefined) {
    plan = false;
    if (isPlainObject(schemaObject) && isSimpleJsonData(schemaObject, 0)) {
      const draft: JsonSchemaDraft | undefined = getSchemaDraft(schemaObject);
      if (draft) {
        try {
          plan = new SchemaAnalyzer(schemaObject, draft).analyze();
        } catch (e) {
          if (!(e instanceof UnsupportedSchemaError)) {
            throw e;
          }
        }
      }
    }

    planCache.set(schemaObject, plan);
  }

  return plan || undefined;
}

function matchesType(data: unknown, type: JsonTypeName): boolean {
  switch (type) {
    case 'string':
      return typeof data === 'string';
    case 'number':
      // Data is known to contain only finite numbers (strictNumbers: true)
      return typeof data === 'number';
    case 'integer':
      return typeof data === 'number' && Number.isInteger(data);
    case 'boolean':
      return typeof data === 'boolean';
    case 'null':
      return data === null;
    case 'array':
      return Array.isArray(data);
    case 'object':
      return typeof data === 'object' && data !== null && !Array.isArray(data);
    default:
      return false;
  }
}

function countCodePoints(value: string): number {
  let count: number = 0;
  for (let i: number = 0; i < value.length; i++) {
    const charCode: number = value.charCodeAt(i);
    count++;
    if (charCode >= 0xd800 && charCode <= 0xdbff && i + 1 < value.length) {
      const nextCharCode: number = value.charCodeAt(i + 1);
      if (nextCharCode >= 0xdc00 && nextCharCode <= 0xdfff) {
        // Surrogate pair, counted as one character (ajv's ucs2length)
        i++;
      }
    }
  }

  return count;
}

function validateNode(plan: ISchemaPlan, schema: ISchemaObject, data: unknown): boolean {
  const type: unknown = schema.type;
  if (type !== undefined) {
    if (typeof type === 'string') {
      if (!matchesType(data, type as JsonTypeName)) {
        return false;
      }
    } else if (!(type as JsonTypeName[]).some((t: JsonTypeName) => matchesType(data, t))) {
      return false;
    }
  }

  if (schema.$ref !== undefined && !validateNode(plan, plan.refTargets.get(schema.$ref as string)!, data)) {
    return false;
  }

  const enumValues: unknown = schema.enum;
  if (enumValues !== undefined && !(enumValues as unknown[]).some((v: unknown) => deepEqual(data, v))) {
    return false;
  }

  if (schema.const !== undefined && !deepEqual(data, schema.const)) {
    return false;
  }

  const allOf: unknown = schema.allOf;
  if (allOf !== undefined) {
    // The order of evaluation doesn't affect the result, so evaluate subschemas without a $ref first: they are
    // cheaper, and often reject the data.
    for (const subschema of allOf as ISchemaObject[]) {
      if (subschema.$ref === undefined && !validateNode(plan, subschema, data)) {
        return false;
      }
    }

    for (const subschema of allOf as ISchemaObject[]) {
      if (subschema.$ref !== undefined && !validateNode(plan, subschema, data)) {
        return false;
      }
    }
  }

  const anyOf: unknown = schema.anyOf;
  if (anyOf !== undefined) {
    if (!(anyOf as ISchemaObject[]).some((subschema: ISchemaObject) => validateNode(plan, subschema, data))) {
      return false;
    }
  }

  const oneOf: unknown = schema.oneOf;
  if (oneOf !== undefined) {
    let passingCount: number = 0;
    for (const subschema of oneOf as ISchemaObject[]) {
      if (validateNode(plan, subschema, data) && ++passingCount > 1) {
        return false;
      }
    }

    if (passingCount !== 1) {
      return false;
    }
  }

  if (schema.not !== undefined && validateNode(plan, schema.not as ISchemaObject, data)) {
    return false;
  }

  switch (typeof data) {
    case 'string': {
      if (schema.minLength !== undefined || schema.maxLength !== undefined) {
        const length: number = countCodePoints(data);
        if (schema.minLength !== undefined && length < (schema.minLength as number)) {
          return false;
        }

        if (schema.maxLength !== undefined && length > (schema.maxLength as number)) {
          return false;
        }
      }

      if (schema.pattern !== undefined && !plan.regExpCache.get(schema.pattern as string)!.test(data)) {
        return false;
      }

      break;
    }

    case 'number': {
      if (schema.minimum !== undefined && data < (schema.minimum as number)) {
        return false;
      }

      if (schema.maximum !== undefined && data > (schema.maximum as number)) {
        return false;
      }

      if (schema.exclusiveMinimum !== undefined && data <= (schema.exclusiveMinimum as number)) {
        return false;
      }

      if (schema.exclusiveMaximum !== undefined && data >= (schema.exclusiveMaximum as number)) {
        return false;
      }

      break;
    }

    case 'object': {
      if (data === null) {
        break;
      }

      if (Array.isArray(data)) {
        if (schema.minItems !== undefined && data.length < (schema.minItems as number)) {
          return false;
        }

        if (schema.maxItems !== undefined && data.length > (schema.maxItems as number)) {
          return false;
        }

        const items: unknown = schema.items;
        if (items !== undefined) {
          for (const item of data) {
            if (!validateNode(plan, items as ISchemaObject, item)) {
              return false;
            }
          }
        }

        if (schema.uniqueItems === true) {
          for (let i: number = 1; i < data.length; i++) {
            for (let j: number = 0; j < i; j++) {
              if (deepEqual(data[i], data[j])) {
                return false;
              }
            }
          }
        }

        break;
      }

      const dataObject: Record<string, unknown> = data as Record<string, unknown>;
      const required: unknown = schema.required;
      if (required !== undefined) {
        for (const propertyName of required as string[]) {
          if (dataObject[propertyName] === undefined) {
            return false;
          }
        }
      }

      const dataKeys: string[] = Object.keys(dataObject);
      if (schema.minProperties !== undefined && dataKeys.length < (schema.minProperties as number)) {
        return false;
      }

      if (schema.maxProperties !== undefined && dataKeys.length > (schema.maxProperties as number)) {
        return false;
      }

      const properties: ISchemaObject | undefined = schema.properties as ISchemaObject | undefined;
      if (properties !== undefined) {
        for (const propertyName of Object.keys(properties)) {
          const propertyValue: unknown = dataObject[propertyName];
          if (
            propertyValue !== undefined &&
            !validateNode(plan, properties[propertyName] as ISchemaObject, propertyValue)
          ) {
            return false;
          }
        }
      }

      const patternProperties: ISchemaObject | undefined = schema.patternProperties as
        | ISchemaObject
        | undefined;
      const patterns: string[] | undefined = patternProperties ? Object.keys(patternProperties) : undefined;
      if (patterns) {
        for (const pattern of patterns) {
          const regExp: RegExp = plan.regExpCache.get(pattern)!;
          const patternSchema: ISchemaObject = patternProperties![pattern] as ISchemaObject;
          for (const key of dataKeys) {
            if (regExp.test(key) && !validateNode(plan, patternSchema, dataObject[key])) {
              return false;
            }
          }
        }
      }

      const additionalProperties: unknown = schema.additionalProperties;
      if (additionalProperties !== undefined && additionalProperties !== true) {
        for (const key of dataKeys) {
          if (properties !== undefined && hasOwn(properties, key)) {
            continue;
          }

          if (patterns && patterns.some((pattern: string) => plan.regExpCache.get(pattern)!.test(key))) {
            continue;
          }

          if (
            additionalProperties === false ||
            !validateNode(plan, additionalProperties as ISchemaObject, dataObject[key])
          ) {
            return false;
          }
        }
      }

      break;
    }

    default: {
      break;
    }
  }

  return true;
}

/**
 * Returns `true` if the schema is in the supported subset, i.e. `isDefinitelyValid()` can return `true` for it.
 */
export function isSchemaSupported(schemaObject: object): boolean {
  if (!isPlainObject(schemaObject) || !isSimpleJsonData(schemaObject, 0)) {
    return false;
  }

  const draft: JsonSchemaDraft | undefined = getSchemaDraft(schemaObject);
  if (!draft) {
    return false;
  }

  try {
    new SchemaAnalyzer(schemaObject, draft).analyze();
    return true;
  } catch (e) {
    if (!(e instanceof UnsupportedSchemaError)) {
      throw e;
    }

    return false;
  }
}

/**
 * Returns `true` only if `JsonSchema.fromLoadedObject(schemaObject).validateObject(data, ...)` from
 * `@rushstack/node-core-library` is guaranteed to succeed without logging anything. A `false` result means
 * "unknown": the caller must perform the real validation.
 *
 * @param schemaObject - The parsed schema. Results of the schema analysis are cached per object, so the object must
 * not be mutated afterwards.
 * @param data - The data to validate.
 */
export function isDefinitelyValid(schemaObject: object, data: unknown): boolean {
  const plan: ISchemaPlan | undefined = getSchemaPlan(schemaObject);
  if (!plan || !isSimpleJsonData(data, 0)) {
    return false;
  }

  return validateNode(plan, plan.root, data);
}
