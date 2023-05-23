// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A library for loading config files for use with the
 * {@link https://rushstack.io/pages/heft/overview/ | Heft} build system.
 *
 * @packageDocumentation
 */

export {
  ConfigurationFile,
  IConfigurationFileOptionsBase,
  IConfigurationFileOptionsWithJsonSchemaFilePath,
  IConfigurationFileOptionsWithJsonSchemaObject,
  IConfigurationFileOptions,
  ICustomJsonPathMetadata,
  ICustomPropertyInheritance,
  IJsonPathMetadataResolverOptions,
  IJsonPathMetadata,
  IJsonPathsMetadata,
  InheritanceType,
  INonCustomJsonPathMetadata,
  IOriginalValueOptions,
  IPropertiesInheritance,
  IPropertyInheritance,
  IPropertyInheritanceDefaults,
  PathResolutionMethod,
  PropertyInheritanceCustomFunction
} from './ConfigurationFile';
