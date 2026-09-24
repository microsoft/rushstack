// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A *sound* fast path for {@link JsonSchema} validation that avoids compiling the schema with ajv.
 *
 * `JsonSchema` compiles every schema with ajv (`strictSchema: true, allowUnionTypes: true`, using `ajv-draft-04`
 * for draft-04 schemas), which is expensive: loading ajv and generating code for a typical schema takes tens of
 * milliseconds, and most validated objects are valid.
 *
 * This module answers a single question: "would ajv compile this schema without any error or warning, and accept
 * this data?" It only returns `true` when it can prove that the answer is yes. In every other case (unsupported
 * keyword, anything ajv's strict mode would log or reject, unusual data, or simply invalid data) it returns `false`,
 * and the caller must fall back to the real ajv validation, which produces the canonical behavior and
 * error messages.
 *
 * The supported subset intentionally mirrors ajv's semantics rather than the JSON schema specification where the
 * two differ (for example, keywords next to `$ref` are applied, and `required`/`properties` use
 * `data[key] !== undefined`).
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
  readonly compiledNodes: Map<ISchemaObject, ICompiledNode>;
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

  public constructor(root: ISchemaObject, draft: JsonSchemaDraft, rejectVendorExtensionKeywords: boolean) {
    this._root = root;
    this._draft = draft;
    const vendorKeywords: Set<string> = new Set();
    // JsonSchema registers the top-level vendor extension keywords with ajv, unless they are rejected
    if (!rejectVendorExtensionKeywords) {
      for (const key of Object.keys(root)) {
        if (VENDOR_EXTENSION_KEY_PATTERN.test(key)) {
          vendorKeywords.add(key);
        }
      }
    }

    this._vendorKeywords = vendorKeywords;
  }

  public analyze(): ISchemaPlan {
    this._analyzeSchema(this._root, [], true);
    return {
      root: this._root,
      regExpCache: this._regExpCache,
      refTargets: this._refTargets,
      compiledNodes: new Map()
    };
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

function getSchemaDraft(schema: ISchemaObject, schemaVersion: JsonSchemaDraft | undefined): JsonSchemaDraft | undefined {
  // Mirrors JsonSchema.ensureCompiled(): the schemaVersion option selects the ajv class, otherwise it is inferred
  // from "$schema" (defaulting to draft-07). Only the meta-schema URLs that ajv resolves are supported.
  const $schema: unknown = schema.$schema;
  let inferred: JsonSchemaDraft | undefined;
  switch ($schema) {
    case undefined:
      return schemaVersion ?? 'draft-07';
    case 'http://json-schema.org/draft-07/schema#':
    case 'http://json-schema.org/draft-07/schema':
      inferred = 'draft-07';
      break;
    case 'http://json-schema.org/draft-04/schema#':
    case 'http://json-schema.org/draft-04/schema':
      inferred = 'draft-04';
      break;
    default:
      return undefined;
  }

  return schemaVersion === undefined || schemaVersion === inferred ? inferred : undefined;
}

/**
 * A schema object, preprocessed for validation: only the keywords that are present are populated, and every
 * instance has the same shape, which keeps property access fast even before the code is optimized.
 */
interface ICompiledNode {
  types: JsonTypeName[] | undefined;
  ref: ICompiledNode | undefined;
  enumValues: unknown[] | undefined;
  hasConst: boolean;
  constValue: unknown;
  allOf: ICompiledNode[] | undefined;
  anyOf: ICompiledNode[] | undefined;
  oneOf: ICompiledNode[] | undefined;
  not: ICompiledNode | undefined;
  stringChecks: IStringChecks | undefined;
  numberChecks: INumberChecks | undefined;
  arrayChecks: IArrayChecks | undefined;
  objectChecks: IObjectChecks | undefined;
}

interface IStringChecks {
  minLength: number | undefined;
  maxLength: number | undefined;
  pattern: RegExp | undefined;
}

interface INumberChecks {
  minimum: number | undefined;
  maximum: number | undefined;
  exclusiveMinimum: number | undefined;
  exclusiveMaximum: number | undefined;
}

interface IArrayChecks {
  minItems: number | undefined;
  maxItems: number | undefined;
  items: ICompiledNode | undefined;
  uniqueItems: boolean;
}

interface IObjectChecks {
  required: string[] | undefined;
  minProperties: number | undefined;
  maxProperties: number | undefined;
  properties: ISchemaObject | undefined;
  propertyNodes: Map<string, ICompiledNode> | undefined;
  patternProperties: [RegExp, ICompiledNode][] | undefined;
  // `true` if additional properties are allowed without validation
  additionalProperties: boolean | ICompiledNode;
}

function getRegExp(plan: ISchemaPlan, pattern: string): RegExp {
  let regExp: RegExp | undefined = plan.regExpCache.get(pattern);
  if (!regExp) {
    // ajv uses the "u" flag (unicodeRegExp: true)
    regExp = new RegExp(pattern, 'u');
    plan.regExpCache.set(pattern, regExp);
  }

  return regExp;
}

function compileNode(plan: ISchemaPlan, schema: ISchemaObject): ICompiledNode {
  let node: ICompiledNode | undefined = plan.compiledNodes.get(schema);
  if (node) {
    return node;
  }

  node = {
    types: undefined,
    ref: undefined,
    enumValues: undefined,
    hasConst: false,
    constValue: undefined,
    allOf: undefined,
    anyOf: undefined,
    oneOf: undefined,
    not: undefined,
    stringChecks: undefined,
    numberChecks: undefined,
    arrayChecks: undefined,
    objectChecks: undefined
  };
  // Register before compiling subschemas, to support recursive references
  plan.compiledNodes.set(schema, node);

  const compileSubschemas: (value: unknown) => ICompiledNode[] = (value: unknown) =>
    (value as ISchemaObject[]).map((subschema: ISchemaObject) => compileNode(plan, subschema));

  if (schema.type !== undefined) {
    node.types = getSchemaTypes(schema);
  }

  if (schema.$ref !== undefined) {
    const ref: string = schema.$ref as string;
    let target: ISchemaObject | undefined = plan.refTargets.get(ref);
    if (!target) {
      target =
        ref === '#'
          ? plan.root
          : ((plan.root.definitions as ISchemaObject)[
              SIMPLE_DEFINITION_REF_REGEXP.exec(ref)![1]
            ] as ISchemaObject);
      plan.refTargets.set(ref, target);
    }

    node.ref = compileNode(plan, target);
  }

  if (schema.enum !== undefined) {
    node.enumValues = schema.enum as unknown[];
  }

  if (schema.const !== undefined) {
    node.hasConst = true;
    node.constValue = schema.const;
  }

  if (schema.allOf !== undefined) {
    // The order of evaluation doesn't affect the result (and validation has no side effects), so evaluate
    // subschemas without a $ref first: they are cheaper, and often reject the data.
    const allOf: ICompiledNode[] = compileSubschemas(schema.allOf);
    node.allOf = allOf
      .filter((n: ICompiledNode) => n.ref === undefined)
      .concat(allOf.filter((n: ICompiledNode) => n.ref !== undefined));
  }

  if (schema.anyOf !== undefined) {
    node.anyOf = compileSubschemas(schema.anyOf);
  }

  if (schema.oneOf !== undefined) {
    node.oneOf = compileSubschemas(schema.oneOf);
  }

  if (schema.not !== undefined) {
    node.not = compileNode(plan, schema.not as ISchemaObject);
  }

  if (schema.minLength !== undefined || schema.maxLength !== undefined || schema.pattern !== undefined) {
    node.stringChecks = {
      minLength: schema.minLength as number | undefined,
      maxLength: schema.maxLength as number | undefined,
      pattern: schema.pattern !== undefined ? getRegExp(plan, schema.pattern as string) : undefined
    };
  }

  if (
    schema.minimum !== undefined ||
    schema.maximum !== undefined ||
    schema.exclusiveMinimum !== undefined ||
    schema.exclusiveMaximum !== undefined
  ) {
    node.numberChecks = {
      minimum: schema.minimum as number | undefined,
      maximum: schema.maximum as number | undefined,
      exclusiveMinimum: schema.exclusiveMinimum as number | undefined,
      exclusiveMaximum: schema.exclusiveMaximum as number | undefined
    };
  }

  if (
    schema.minItems !== undefined ||
    schema.maxItems !== undefined ||
    schema.items !== undefined ||
    schema.uniqueItems === true
  ) {
    node.arrayChecks = {
      minItems: schema.minItems as number | undefined,
      maxItems: schema.maxItems as number | undefined,
      items: schema.items !== undefined ? compileNode(plan, schema.items as ISchemaObject) : undefined,
      uniqueItems: schema.uniqueItems === true
    };
  }

  const additionalProperties: unknown = schema.additionalProperties;
  if (
    schema.required !== undefined ||
    schema.minProperties !== undefined ||
    schema.maxProperties !== undefined ||
    schema.properties !== undefined ||
    schema.patternProperties !== undefined ||
    (additionalProperties !== undefined && additionalProperties !== true)
  ) {
    const properties: ISchemaObject | undefined = schema.properties as ISchemaObject | undefined;
    let propertyNodes: Map<string, ICompiledNode> | undefined;
    if (properties) {
      propertyNodes = new Map();
      for (const propertyName of Object.keys(properties)) {
        propertyNodes.set(propertyName, compileNode(plan, properties[propertyName] as ISchemaObject));
      }
    }

    const patternPropertiesSchema: ISchemaObject | undefined = schema.patternProperties as
      | ISchemaObject
      | undefined;
    let patternProperties: [RegExp, ICompiledNode][] | undefined;
    if (patternPropertiesSchema) {
      patternProperties = [];
      for (const pattern of Object.keys(patternPropertiesSchema)) {
        patternProperties.push([
          getRegExp(plan, pattern),
          compileNode(plan, patternPropertiesSchema[pattern] as ISchemaObject)
        ]);
      }
    }

    node.objectChecks = {
      required: schema.required as string[] | undefined,
      minProperties: schema.minProperties as number | undefined,
      maxProperties: schema.maxProperties as number | undefined,
      properties,
      propertyNodes,
      patternProperties,
      additionalProperties:
        additionalProperties === undefined || additionalProperties === true
          ? true
          : additionalProperties === false
            ? false
            : compileNode(plan, additionalProperties as ISchemaObject)
    };
  }

  return node;
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

function validateNode(node: ICompiledNode, data: unknown): boolean {
  const types: JsonTypeName[] | undefined = node.types;
  if (types !== undefined) {
    let typeMatches: boolean = false;
    for (const type of types) {
      if (matchesType(data, type)) {
        typeMatches = true;
        break;
      }
    }

    if (!typeMatches) {
      return false;
    }
  }

  if (node.ref !== undefined && !validateNode(node.ref, data)) {
    return false;
  }

  const enumValues: unknown[] | undefined = node.enumValues;
  if (enumValues !== undefined) {
    let found: boolean = false;
    for (const enumValue of enumValues) {
      if (deepEqual(data, enumValue)) {
        found = true;
        break;
      }
    }

    if (!found) {
      return false;
    }
  }

  if (node.hasConst && !deepEqual(data, node.constValue)) {
    return false;
  }

  const allOf: ICompiledNode[] | undefined = node.allOf;
  if (allOf !== undefined) {
    for (const subschema of allOf) {
      if (!validateNode(subschema, data)) {
        return false;
      }
    }
  }

  const anyOf: ICompiledNode[] | undefined = node.anyOf;
  if (anyOf !== undefined) {
    let anyPassed: boolean = false;
    for (const subschema of anyOf) {
      if (validateNode(subschema, data)) {
        anyPassed = true;
        break;
      }
    }

    if (!anyPassed) {
      return false;
    }
  }

  const oneOf: ICompiledNode[] | undefined = node.oneOf;
  if (oneOf !== undefined) {
    let passingCount: number = 0;
    for (const subschema of oneOf) {
      if (validateNode(subschema, data) && ++passingCount > 1) {
        return false;
      }
    }

    if (passingCount !== 1) {
      return false;
    }
  }

  if (node.not !== undefined && validateNode(node.not, data)) {
    return false;
  }

  switch (typeof data) {
    case 'string': {
      const stringChecks: IStringChecks | undefined = node.stringChecks;
      if (stringChecks !== undefined) {
        const { minLength, maxLength, pattern } = stringChecks;
        if (minLength !== undefined || maxLength !== undefined) {
          const length: number = countCodePoints(data);
          if (minLength !== undefined && length < minLength) {
            return false;
          }

          if (maxLength !== undefined && length > maxLength) {
            return false;
          }
        }

        if (pattern !== undefined && !pattern.test(data)) {
          return false;
        }
      }

      break;
    }

    case 'number': {
      const numberChecks: INumberChecks | undefined = node.numberChecks;
      if (numberChecks !== undefined) {
        const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = numberChecks;
        if (minimum !== undefined && data < minimum) {
          return false;
        }

        if (maximum !== undefined && data > maximum) {
          return false;
        }

        if (exclusiveMinimum !== undefined && data <= exclusiveMinimum) {
          return false;
        }

        if (exclusiveMaximum !== undefined && data >= exclusiveMaximum) {
          return false;
        }
      }

      break;
    }

    case 'object': {
      if (data === null) {
        break;
      }

      if (Array.isArray(data)) {
        const arrayChecks: IArrayChecks | undefined = node.arrayChecks;
        if (arrayChecks !== undefined) {
          const { minItems, maxItems, items, uniqueItems } = arrayChecks;
          if (minItems !== undefined && data.length < minItems) {
            return false;
          }

          if (maxItems !== undefined && data.length > maxItems) {
            return false;
          }

          if (items !== undefined) {
            for (const item of data) {
              if (!validateNode(items, item)) {
                return false;
              }
            }
          }

          if (uniqueItems) {
            for (let i: number = 1; i < data.length; i++) {
              for (let j: number = 0; j < i; j++) {
                if (deepEqual(data[i], data[j])) {
                  return false;
                }
              }
            }
          }
        }

        break;
      }

      const objectChecks: IObjectChecks | undefined = node.objectChecks;
      if (objectChecks === undefined) {
        break;
      }

      const dataObject: Record<string, unknown> = data as Record<string, unknown>;
      const { required, minProperties, maxProperties, properties, propertyNodes, patternProperties } =
        objectChecks;
      if (required !== undefined) {
        for (const propertyName of required) {
          if (dataObject[propertyName] === undefined) {
            return false;
          }
        }
      }

      const dataKeys: string[] = Object.keys(dataObject);
      if (minProperties !== undefined && dataKeys.length < minProperties) {
        return false;
      }

      if (maxProperties !== undefined && dataKeys.length > maxProperties) {
        return false;
      }

      if (propertyNodes !== undefined) {
        for (const [propertyName, propertyNode] of propertyNodes) {
          const propertyValue: unknown = dataObject[propertyName];
          if (propertyValue !== undefined && !validateNode(propertyNode, propertyValue)) {
            return false;
          }
        }
      }

      if (patternProperties !== undefined) {
        for (const [regExp, patternNode] of patternProperties) {
          for (const key of dataKeys) {
            if (regExp.test(key) && !validateNode(patternNode, dataObject[key])) {
              return false;
            }
          }
        }
      }

      const additionalProperties: boolean | ICompiledNode = objectChecks.additionalProperties;
      if (additionalProperties !== true) {
        for (const key of dataKeys) {
          if (properties !== undefined && hasOwn(properties, key)) {
            continue;
          }

          if (patternProperties !== undefined) {
            let matchesPattern: boolean = false;
            for (const [regExp] of patternProperties) {
              if (regExp.test(key)) {
                matchesPattern = true;
                break;
              }
            }

            if (matchesPattern) {
              continue;
            }
          }

          if (additionalProperties === false || !validateNode(additionalProperties, dataObject[key])) {
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
 * Deep-copies data that was verified by isSimpleJsonData(). Unlike structuredClone(), the copy is created in the
 * current realm (structuredClone() may belong to another realm, for example in a vm context).
 */
function cloneJsonData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(cloneJsonData);
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    result[key] = cloneJsonData((value as Record<string, unknown>)[key]);
  }

  return result;
}

/**
 * Options for {@link analyzeSchemaForFastPath}.
 */
export interface IJsonSchemaFastPathOptions {
  schemaVersion: JsonSchemaDraft | undefined;
  rejectVendorExtensionKeywords: boolean;
}

/**
 * The result of analyzing a schema that is in the supported subset.
 */
export interface IJsonSchemaFastPathPlan {
  readonly _plan: ISchemaPlan;
}

/**
 * Analyzes a schema for {@link isDefinitelyValid}. Returns `undefined` if the schema is not in the supported subset
 * (or if ajv would reject it or log a warning while compiling it).
 *
 * @remarks
 * The schema is copied, so later changes to `schemaObject` do not affect the returned plan (like a compiled ajv
 * validator).
 */
export function analyzeSchemaForFastPath(
  schemaObject: object,
  options: IJsonSchemaFastPathOptions
): IJsonSchemaFastPathPlan | undefined {
  if (!isPlainObject(schemaObject) || !isSimpleJsonData(schemaObject, 0)) {
    return undefined;
  }

  const root: ISchemaObject = cloneJsonData(schemaObject) as ISchemaObject;
  const draft: JsonSchemaDraft | undefined = getSchemaDraft(root, options.schemaVersion);
  if (!draft) {
    return undefined;
  }

  try {
    return { _plan: new SchemaAnalyzer(root, draft, options.rejectVendorExtensionKeywords).analyze() };
  } catch (e) {
    if (!(e instanceof UnsupportedSchemaError)) {
      throw e;
    }

    return undefined;
  }
}

/**
 * Returns `true` only if validating `data` with ajv against the analyzed schema is guaranteed to succeed. A `false`
 * result means "unknown": the caller must perform the real validation.
 */
export function isDefinitelyValid(plan: IJsonSchemaFastPathPlan, data: unknown): boolean {
  if (!isSimpleJsonData(data, 0)) {
    return false;
  }

  return validateNode(compileNode(plan._plan, plan._plan.root), data);
}
