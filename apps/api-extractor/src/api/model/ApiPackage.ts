// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind, IApiItemJson } from './ApiItem';
import { ApiItemContainerMixin, IApiItemContainerMixinOptions } from '../mixins/ApiItemContainerMixin';
import { JsonFile, IJsonFileSaveOptions } from '@microsoft/node-core-library';
import { ApiDocumentedItem, IApiDocumentedItemOptions } from './ApiDocumentedItem';
import { Extractor } from '../Extractor';
import { ApiEntryPoint } from './ApiEntryPoint';

/** @public */
export interface IApiPackageOptions extends
  IApiItemContainerMixinOptions,
  IApiDocumentedItemOptions {
}

export enum ApiJsonSchemaVersion {
  /**
   * The initial release.
   */
  V_1000 = 1000
}

export interface IApiPackageMetadataJson {
  /**
   * The NPM package name for the tool that wrote the *.api.json file.
   * For informational purposes only.
   */
  toolPackage: string;
  /**
   * The NPM package version for the tool that wrote the *.api.json file.
   * For informational purposes only.
   */
  toolVersion: string;

  /**
   * The *.api.json schema version.  Used for determining whether the file format is
   * supported, and for backwards compatibility.
   */
  schemaVersion: ApiJsonSchemaVersion;
}

export interface IApiPackageJson extends IApiItemJson {
  /**
   * A file header that stores metadata about the tool that wrote the *.api.json file.
   */
  metadata: IApiPackageMetadataJson;
}

/** @public */
export class ApiPackage extends ApiItemContainerMixin(ApiDocumentedItem) {
  public static loadFromJsonFile(apiJsonFilename: string): ApiPackage {
    const jsonObject: { } = JsonFile.load(apiJsonFilename);
    return ApiItem.deserialize(jsonObject as IApiItemJson) as ApiPackage;
  }

  public constructor(options: IApiPackageOptions) {
    super(options);
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Package;
  }

  /** @override */
  public get canonicalReference(): string {
    return this.name;
  }

  public get entryPoints(): ReadonlyArray<ApiEntryPoint> {
    return this.members as ReadonlyArray<ApiEntryPoint>;
  }

  /** @override */
  public addMember(member: ApiEntryPoint): void {
    if (member.kind !== ApiItemKind.EntryPoint) {
      throw new Error('Only items of type ApiEntryPoint may be added to an ApiPackage');
    }
    super.addMember(member);
  }

  public findEntryPointsByPath(importPath: string): ReadonlyArray<ApiEntryPoint> {
    return this.findMembersByName(importPath) as ReadonlyArray<ApiEntryPoint>;
  }

  public saveToJsonFile(apiJsonFilename: string, options?: IJsonFileSaveOptions): void {
    const jsonObject: IApiPackageJson = {
      metadata: {
        toolPackage: Extractor.packageName,
        toolVersion: Extractor.version,
        schemaVersion: ApiJsonSchemaVersion.V_1000
      }
    } as IApiPackageJson;
    this.serializeInto(jsonObject);
    JsonFile.save(jsonObject, apiJsonFilename, options);
  }
}
