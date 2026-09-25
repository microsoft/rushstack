// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { CONFIGURATION_FILE_FIELD_ANNOTATION } from '@rushstack/heft-config-file/lib/ConfigurationFileAnnotation';

const ANNOTATION_DESCRIPTION: string = 'configuration-file-field-annotation';

/**
 * Converts a loaded configuration into a plain structure that includes the annotations that
 * `@rushstack/heft-config-file` attaches to every object (source file path and original values).
 */
export function describeValue(value: unknown, depth: number = 0): unknown {
  if (depth > 50) {
    throw new Error('Too deep');
  }

  if (typeof value !== 'object' || value === null) {
    return Object.is(value, -0) ? '-0' : value;
  }

  const annotationSymbol: symbol | undefined = Object.getOwnPropertySymbols(value).find(
    (s: symbol) => s.description === ANNOTATION_DESCRIPTION
  );
  const annotation: Record<string, unknown> | undefined = annotationSymbol
    ? (value as Record<symbol, Record<string, unknown>>)[annotationSymbol]
    : undefined;
  const result: Record<string, unknown> = {
    kind: Array.isArray(value) ? 'array' : 'object',
    keys: Object.keys(value),
    values: Object.values(value).map((v: unknown) => describeValue(v, depth + 1)),
    otherSymbols: Object.getOwnPropertySymbols(value).filter((s: symbol) => s !== annotationSymbol).length
  };
  if (annotation) {
    // Plugins read the annotations with heft-config-file's APIs, which requires the identical symbol
    result.annotationSymbolIsHeftConfigFiles = annotationSymbol === CONFIGURATION_FILE_FIELD_ANNOTATION;
    result.annotation = {
      configurationFilePath: annotation.configurationFilePath,
      schemaPropertyOriginalValue: annotation.schemaPropertyOriginalValue,
      hasSchemaPropertyOriginalValue: 'schemaPropertyOriginalValue' in annotation,
      originalValues: describeValue({ ...(annotation.originalValues as object) }, depth + 1)
    };
  }

  return result;
}

export function writeFiles(rootFolder: string, files: Record<string, string | object>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath: string = path.join(rootFolder, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content, undefined, 2));
  }
}

export function replaceAll<T>(value: T, from: string, to: string): T {
  if (typeof value === 'string') {
    return value.split(from).join(to) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => replaceAll(item, from, to)) as unknown as T;
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[replaceAll(key, from, to)] = replaceAll(item, from, to);
    }

    return result as T;
  }

  return value;
}

