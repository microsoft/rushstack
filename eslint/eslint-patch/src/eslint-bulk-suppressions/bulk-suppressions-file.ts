// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'node:fs';

import { VSCODE_PID_ENV_VAR_NAME } from './constants.ts';

export interface ISuppression {
  file: string;
  scopeId: string;
  rule: string;
}

export interface IBulkSuppressionsConfig {
  serializedSuppressions: Set<string>;
  jsonObject: IBulkSuppressionsJson;
  newSerializedSuppressions: Set<string>;
  newJsonObject: IBulkSuppressionsJson;
}

export interface IBulkSuppressionsJson {
  suppressions: ISuppression[];
}

const IS_RUNNING_IN_VSCODE: boolean = process.env[VSCODE_PID_ENV_VAR_NAME] !== undefined;
const TEN_SECONDS_MS: number = 10 * 1000;
const SUPPRESSIONS_JSON_FILENAME: string = '.eslint-bulk-suppressions.json';

function throwIfAnythingOtherThanNotExistError(e: NodeJS.ErrnoException): void | never {
  if (e?.code !== 'ENOENT') {
    // Throw an error if any other error than file not found
    throw e;
  }
}

interface ICachedBulkSuppressionsConfig {
  readTime: number;
  suppressionsConfig: IBulkSuppressionsConfig;
}
const suppressionsJsonByFolderPath: Map<string, ICachedBulkSuppressionsConfig> = new Map();
export function getSuppressionsConfigForEslintConfigFolderPath(
  eslintConfigFolderPath: string
): IBulkSuppressionsConfig {
  const cachedSuppressionsConfig: ICachedBulkSuppressionsConfig | undefined =
    suppressionsJsonByFolderPath.get(eslintConfigFolderPath);

  let shouldLoad: boolean;
  let suppressionsConfig: IBulkSuppressionsConfig;
  if (cachedSuppressionsConfig) {
    shouldLoad = IS_RUNNING_IN_VSCODE && cachedSuppressionsConfig.readTime < Date.now() - TEN_SECONDS_MS;
    suppressionsConfig = cachedSuppressionsConfig.suppressionsConfig;
  } else {
    shouldLoad = true;
  }

  if (shouldLoad) {
    const suppressionsPath: string = `${eslintConfigFolderPath}/${SUPPRESSIONS_JSON_FILENAME}`;
    let rawJsonFile: string | undefined;
    try {
      rawJsonFile = fs.readFileSync(suppressionsPath).toString();
    } catch (e) {
      throwIfAnythingOtherThanNotExistError(e);
    }

    if (!rawJsonFile) {
      suppressionsConfig = {
        serializedSuppressions: new Set(),
        jsonObject: { suppressions: [] },
        newSerializedSuppressions: new Set(),
        newJsonObject: { suppressions: [] }
      };
    } else {
      const jsonObject: IBulkSuppressionsJson = JSON.parse(rawJsonFile);
      validateSuppressionsJson(jsonObject);

      const serializedSuppressions: Set<string> = new Set();
      for (const suppression of jsonObject.suppressions) {
        serializedSuppressions.add(serializeSuppression(suppression));
      }

      suppressionsConfig = {
        serializedSuppressions,
        jsonObject,
        newSerializedSuppressions: new Set(),
        newJsonObject: { suppressions: [] }
      };
    }

    suppressionsJsonByFolderPath.set(eslintConfigFolderPath, { readTime: Date.now(), suppressionsConfig });
  }

  return suppressionsConfig!;
}

export function getAllBulkSuppressionsConfigsByEslintConfigFolderPath(): [string, IBulkSuppressionsConfig][] {
  const result: [string, IBulkSuppressionsConfig][] = [];
  for (const [eslintConfigFolderPath, { suppressionsConfig }] of suppressionsJsonByFolderPath) {
    result.push([eslintConfigFolderPath, suppressionsConfig]);
  }

  return result;
}

export function writeSuppressionsJsonToFile(
  eslintConfigFolderPath: string,
  suppressionsConfig: IBulkSuppressionsConfig
): void {
  suppressionsJsonByFolderPath.set(eslintConfigFolderPath, { readTime: Date.now(), suppressionsConfig });
  const suppressionsPath: string = `${eslintConfigFolderPath}/${SUPPRESSIONS_JSON_FILENAME}`;
  if (suppressionsConfig.jsonObject.suppressions.length === 0) {
    deleteFile(suppressionsPath);
  } else {
    suppressionsConfig.jsonObject.suppressions.sort(compareSuppressions);
    fs.writeFileSync(suppressionsPath, JSON.stringify(suppressionsConfig.jsonObject, undefined, 2));
  }
}

export function deleteBulkSuppressionsFileInEslintConfigFolder(eslintConfigFolderPath: string): void {
  const suppressionsPath: string = `${eslintConfigFolderPath}/${SUPPRESSIONS_JSON_FILENAME}`;
  deleteFile(suppressionsPath);
}

function deleteFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (e) {
    throwIfAnythingOtherThanNotExistError(e);
  }
}

export function serializeSuppression({ file, scopeId, rule }: ISuppression): string {
  return `${file}|${scopeId}|${rule}`;
}

function compareSuppressions(a: ISuppression, b: ISuppression): -1 | 0 | 1 {
  if (a.file < b.file) {
    return -1;
  } else if (a.file > b.file) {
    return 1;
  } else if (a.scopeId < b.scopeId) {
    return -1;
  } else if (a.scopeId > b.scopeId) {
    return 1;
  } else if (a.rule < b.rule) {
    return -1;
  } else if (a.rule > b.rule) {
    return 1;
  } else {
    return 0;
  }
}

function validateSuppressionsJson(json: IBulkSuppressionsJson): json is IBulkSuppressionsJson {
  if (typeof json !== 'object') {
    throw new Error(`Invalid JSON object: ${JSON.stringify(json, null, 2)}`);
  }

  if (!json) {
    throw new Error('JSON object is null.');
  }

  const EXPECTED_ROOT_PROPERTY_NAMES: Set<keyof IBulkSuppressionsJson> = new Set(['suppressions']);

  for (const propertyName of Object.getOwnPropertyNames(json)) {
    if (!EXPECTED_ROOT_PROPERTY_NAMES.has(propertyName as keyof IBulkSuppressionsJson)) {
      throw new Error(`Unexpected property name: ${propertyName}`);
    }
  }

  const { suppressions } = json;
  if (!suppressions) {
    throw new Error('Missing "suppressions" property.');
  }

  if (!Array.isArray(suppressions)) {
    throw new Error('"suppressions" property is not an array.');
  }

  const EXPECTED_SUPPRESSION_PROPERTY_NAMES: Set<keyof ISuppression> = new Set(['file', 'scopeId', 'rule']);
  for (const suppression of suppressions) {
    if (typeof suppression !== 'object') {
      throw new Error(`Invalid suppression: ${JSON.stringify(suppression, null, 2)}`);
    }

    if (!suppression) {
      throw new Error(`Suppression is null: ${JSON.stringify(suppression, null, 2)}`);
    }

    for (const propertyName of Object.getOwnPropertyNames(suppression)) {
      if (!EXPECTED_SUPPRESSION_PROPERTY_NAMES.has(propertyName as keyof ISuppression)) {
        throw new Error(`Unexpected property name: ${propertyName}`);
      }
    }

    for (const propertyName of EXPECTED_SUPPRESSION_PROPERTY_NAMES) {
      if (!suppression.hasOwnProperty(propertyName)) {
        throw new Error(
          `Missing "${propertyName}" property in suppression: ${JSON.stringify(suppression, null, 2)}`
        );
      } else if (typeof suppression[propertyName] !== 'string') {
        throw new Error(
          `"${propertyName}" property in suppression is not a string: ${JSON.stringify(suppression, null, 2)}`
        );
      }
    }
  }

  return true;
}
