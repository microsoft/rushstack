// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A library for loading config files for use with the
 * {@link https://rushstack.io/pages/heft/overview/ | Heft} build system.
 *
 * @packageDocumentation
 */

export {
  ConfigurationFileBase,
  type CustomValidationFunction,
  type IConfigurationFileOptionsBase,
  type IConfigurationFileOptionsWithJsonSchemaFilePath,
  type IConfigurationFileOptionsWithJsonSchemaObject,
  type IConfigurationFileOptions,
  type ICustomJsonPathMetadata,
  type ICustomPropertyInheritance,
  type IJsonPathMetadataResolverOptions,
  type IJsonPathMetadata,
  type IJsonPathsMetadata,
  InheritanceType,
  type INonCustomJsonPathMetadata,
  type IOnConfigurationFileNotFoundCallback,
  type IOriginalValueOptions,
  type IPropertiesInheritance,
  type IPropertyInheritance,
  type IPropertyInheritanceDefaults,
  PathResolutionMethod,
  type PropertyInheritanceCustomFunction
} from './ConfigurationFileBase.ts';

import { ProjectConfigurationFile } from './ProjectConfigurationFile.ts';

/**
 * @deprecated Use {@link ProjectConfigurationFile} instead.
 * @beta
 */
export const ConfigurationFile: typeof ProjectConfigurationFile = ProjectConfigurationFile;

/**
 * @deprecated Use {@link ProjectConfigurationFile} instead.
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type ConfigurationFile<TConfigurationFile> = ProjectConfigurationFile<TConfigurationFile>;

export {
  ProjectConfigurationFile,
  type IProjectConfigurationFileOptions,
  type IProjectConfigurationFileSpecification
} from './ProjectConfigurationFile.ts';
export { NonProjectConfigurationFile } from './NonProjectConfigurationFile.ts';

export * as TestUtilities from './TestUtilities.ts';
