// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { IProjectConfigurationFileSpecification } from '@rushstack/heft-config-file';
import type { IRigConfig } from '@rushstack/rig-package';

import {
  type ILeanLoadResult,
  type ILeanProjectConfigurationFileOptions,
  type LeanInheritanceType,
  LeanProjectConfigurationFile
} from './LeanProjectConfigurationFile';
import { bail, getRigProfileFolder, getSharedLeanPackageJsonLookup, type LeanPackageJsonLookup } from './LeanResolution';
import { tryLoadSchemaFile } from './SchemaFastPath';

// A JSONPath of the form "$.a.*.b", which only selects own properties and members of objects and arrays
const SIMPLE_JSON_PATH_REGEXP: RegExp = /^\$(\.(\*|[A-Za-z_][A-Za-z0-9_]*))+$/;

const INHERITANCE_TYPES: ReadonlySet<string> = new Set<LeanInheritanceType>(['append', 'merge', 'replace']);

type Resolver = ILeanProjectConfigurationFileOptions['customResolvers'][number]['resolve'];

function getInheritanceType(propertyInheritance: unknown): LeanInheritanceType {
  const inheritanceType: unknown = (propertyInheritance as { inheritanceType?: unknown } | undefined)
    ?.inheritanceType;
  if (typeof inheritanceType !== 'string' || !INHERITANCE_TYPES.has(inheritanceType)) {
    // Includes custom inheritance functions, which must not be invoked twice
    bail();
  }

  return inheritanceType as LeanInheritanceType;
}

function createLeanOptions(
  specification: IProjectConfigurationFileSpecification<unknown>,
  packageJsonLookup: LeanPackageJsonLookup,
  rigConfig: IRigConfig | undefined
): ILeanProjectConfigurationFileOptions {
  const {
    projectRelativeFilePath,
    jsonSchemaObject,
    jsonSchemaPath,
    jsonPathMetadata,
    propertyInheritance,
    propertyInheritanceDefaults,
    customValidationFunction
  } = specification;
  if (typeof projectRelativeFilePath !== 'string' || customValidationFunction) {
    // A custom validation function must not be invoked twice
    bail();
  }

  let schemaObject: object | undefined;
  if (jsonSchemaObject) {
    schemaObject = jsonSchemaObject;
  } else if (typeof jsonSchemaPath === 'string') {
    schemaObject = tryLoadSchemaFile(jsonSchemaPath);
  }

  if (typeof schemaObject !== 'object' || schemaObject === null) {
    bail();
  }

  let configuredPropertyInheritance: Map<string, LeanInheritanceType> | undefined;
  if (propertyInheritance) {
    configuredPropertyInheritance = new Map();
    for (const [propertyName, value] of Object.entries(propertyInheritance)) {
      configuredPropertyInheritance.set(propertyName, getInheritanceType(value));
    }
  }

  const customResolvers: { path: string[]; resolve: Resolver }[] = [];
  if (jsonPathMetadata) {
    for (const [jsonPath, metadata] of Object.entries(jsonPathMetadata)) {
      const pathResolutionMethod: unknown = (metadata as { pathResolutionMethod?: unknown } | undefined)
        ?.pathResolutionMethod;
      if (pathResolutionMethod === undefined) {
        // The original implementation leaves the values unchanged
        continue;
      }

      if (!SIMPLE_JSON_PATH_REGEXP.test(jsonPath)) {
        bail();
      }

      let resolve: Resolver;
      switch (pathResolutionMethod) {
        case 'resolvePathRelativeToConfigurationFile': {
          resolve = (propertyValue: string, configurationFilePath: string) =>
            path.resolve(path.dirname(configurationFilePath), propertyValue);
          break;
        }

        case 'resolvePathRelativeToProjectRoot': {
          resolve = (propertyValue: string, configurationFilePath: string, projectFolderPath: string | undefined) =>
            projectFolderPath ? path.resolve(projectFolderPath, propertyValue) : bail();
          break;
        }

        case 'NodeResolve':
        case 'nodeResolve': {
          resolve = (propertyValue: string, configurationFilePath: string) =>
            packageJsonLookup.resolveModule(propertyValue, path.dirname(configurationFilePath));
          break;
        }

        default: {
          // Custom resolvers must not be invoked twice
          bail();
        }
      }

      customResolvers.push({ path: jsonPath.split('.').slice(1), resolve });
    }
  }

  const { array: arrayInheritance, object: objectInheritance } = propertyInheritanceDefaults ?? {};
  return {
    projectRelativeFilePath,
    jsonSchemaObject: schemaObject,
    propertyInheritanceDefaults: {
      array: arrayInheritance ? getInheritanceType(arrayInheritance) : 'append',
      object: objectInheritance ? getInheritanceType(objectInheritance) : 'replace'
    },
    propertyInheritance: configuredPropertyInheritance,
    customResolvers,
    packageJsonLookup,
    getRigProfileFolder: (rigConfigToResolve: IRigConfig) =>
      rigConfigToResolve === rigConfig ? getRigProfileFolder(rigConfigToResolve) : bail()
  };
}

/**
 * The lean equivalent of `new ProjectConfigurationFile(specification).tryLoadConfigurationFileForProject()` from
 * `@rushstack/heft-config-file` (using a fresh loader, like `HeftConfiguration.tryLoadProjectConfigurationFile()`).
 * Returns `undefined` if the result might differ from the original implementation (including for all errors,
 * unsupported options, and options that involve plugin-provided functions), in which case the original
 * implementation must be used.
 *
 * @param isHeftRigConfig - Whether `rigConfig` is a RigConfig object created by Heft, whose profile folder can
 * be resolved without side effects.
 */
export function tryLoadProjectConfigurationFileLean<TConfigurationFile>(
  specification: IProjectConfigurationFileSpecification<TConfigurationFile>,
  projectPath: string,
  rigConfig: IRigConfig | undefined,
  isHeftRigConfig: boolean
): ILeanLoadResult<TConfigurationFile | undefined> | undefined {
  try {
    const options: ILeanProjectConfigurationFileOptions = createLeanOptions(
      specification as IProjectConfigurationFileSpecification<unknown>,
      getSharedLeanPackageJsonLookup(),
      isHeftRigConfig ? rigConfig : undefined
    );
    return new LeanProjectConfigurationFile<TConfigurationFile>(
      options
    ).tryLoadConfigurationFileForProjectAllowMissing(projectPath, rigConfig);
  } catch {
    return undefined;
  }
}
