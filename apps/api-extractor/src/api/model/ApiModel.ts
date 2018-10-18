// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ApiItem, ApiItemKind } from './ApiItem';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';
import { ApiPackage } from './ApiPackage';
import { PackageName } from '@microsoft/node-core-library';
import { DeclarationReferenceResolver, IResolveDeclarationReferenceResult } from './DeclarationReferenceResolver';
import { DocDeclarationReference } from '@microsoft/tsdoc';

/** @public */
export class ApiModel extends ApiItemContainerMixin(ApiItem) {
  private readonly _resolver: DeclarationReferenceResolver;

  private _packagesByName: Map<string, ApiPackage> | undefined = undefined;

  public constructor() {
    super({ name: 'MODEL' });

    this._resolver = new DeclarationReferenceResolver(this);
  }

  public loadPackage(apiJsonFilename: string): ApiPackage {
    const apiPackage: ApiPackage = ApiPackage.loadFromJsonFile(apiJsonFilename);
    this.addMember(apiPackage);
    return apiPackage;
  }

  /** @override */
  public get kind(): ApiItemKind {
    return ApiItemKind.Model;
  }

  /** @override */
  public get canonicalReference(): string {
    return this.name;
  }

  public get packages(): ReadonlyArray<ApiPackage> {
    return this.members as ReadonlyArray<ApiPackage>;
  }

  /** @override */
  public addMember(member: ApiPackage): void {
    if (member.kind !== ApiItemKind.Package) {
      throw new Error('Only items of type ApiPackage may be added to an ApiModel');
    }
    super.addMember(member);

    this._packagesByName = undefined; // invalidate the cache
  }

  /**
   * Efficiently finds a package by the NPM package name.
   *
   * @remarks
   *
   * If the NPM scope is omitted in the package name, it will still be found provided that it is an unambiguous match.
   */
  public tryGetPackageByName(packageName: string): ApiPackage | undefined {
    // Build the lookup on demand
    if (this._packagesByName === undefined) {
      this._packagesByName = new Map<string, ApiPackage>();

      const unscopedMap: Map<string, ApiPackage | undefined> = new Map<string, ApiPackage | undefined>();

      for (const apiPackage of this.packages) {
        if (this._packagesByName.get(apiPackage.name)) {
          // This should not happen
          throw new Error(`The model contains multiple packages with the name ${apiPackage.name}`);
        }

        this._packagesByName.set(apiPackage.name, apiPackage);

        const unscopedName: string = PackageName.parse(apiPackage.name).unscopedName;

        if (unscopedMap.has(unscopedName)) {
          // If another package has the same unscoped name, then we won't register it
          unscopedMap.set(unscopedName, undefined);
        } else {
          unscopedMap.set(unscopedName, apiPackage);
        }
      }

      for (const [unscopedName, apiPackage] of unscopedMap) {
        if (apiPackage) {
          if (!this._packagesByName.has(unscopedName)) {
            // If the unscoped name is unambiguous, then we can also use it as a lookup
            this._packagesByName.set(unscopedName, apiPackage);
          }
        }
      }
    }

    return this._packagesByName.get(packageName);
  }

  public resolveDeclarationReference(declarationReference: DocDeclarationReference,
    contextApiItem: ApiItem | undefined): IResolveDeclarationReferenceResult {
    return this._resolver.resolve(declarationReference, contextApiItem);
  }
}
