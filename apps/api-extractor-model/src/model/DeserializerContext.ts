// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export enum ApiJsonSchemaVersion {
  /**
   * The initial release.
   */
  V_1000 = 1000,

  /**
   * Add support for type parameters and type alias types.
   */
  V_1001 = 1001,

  /**
   * The current latest .api.json schema version
   */
  LATEST = V_1001,

  /**
   * The oldest .api.json schema version that is still supported for backwards compatibility
   */
  OLDEST_SUPPORTED = V_1000
}

export class DeserializerContext {
  /**
   * The path of the file being deserialized, which may be useful for diagnostic purposes.
   */
  public readonly apiJsonFilename: string;

  /**
   * Metadata from `IApiPackageMetadataJson.toolPackage`.
   */
  public readonly toolPackage: string;

  /**
   * Metadata from `IApiPackageMetadataJson.toolVersion`.
   */
  public readonly toolVersion: string;

  /**
   * The version of the schema being deserialized, as obtained from `IApiPackageMetadataJson.schemaVersion`.
   */
  public readonly versionToDeserialize: ApiJsonSchemaVersion;

  public constructor(options: DeserializerContext) {
    this.apiJsonFilename = options.apiJsonFilename;
    this.toolPackage = options.toolPackage;
    this.toolVersion = options.toolVersion;
    this.versionToDeserialize = options.versionToDeserialize;
  }
}
