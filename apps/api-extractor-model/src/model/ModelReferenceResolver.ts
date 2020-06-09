// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DocDeclarationReference, SelectorKind } from '@microsoft/tsdoc';
import { ApiItem } from '../items/ApiItem';
import { ApiModel } from './ApiModel';
import { ApiPackage } from './ApiPackage';
import { ApiEntryPoint } from './ApiEntryPoint';
import { ApiItemContainerMixin } from '../mixins/ApiItemContainerMixin';
import { ApiParameterListMixin } from '../mixins/ApiParameterListMixin';

/**
 * Result object for {@link ApiModel.resolveDeclarationReference}.
 *
 * @public
 */
export interface IResolveDeclarationReferenceResult {
  /**
   * The referenced ApiItem, if the declaration reference could be resolved.
   */
  resolvedApiItem: ApiItem | undefined;

  /**
   * If resolvedApiItem is undefined, then this will always contain an error message explaining why the
   * resolution failed.
   */
  errorMessage: string | undefined;
}

/**
 * This resolves a TSDoc declaration reference by walking the `ApiModel` hierarchy.
 *
 * @remarks
 *
 * This class is analogous to `AstReferenceResolver` from the `@microsoft/api-extractor` project,
 * which resolves declaration references by walking the compiler state.
 */
export class ModelReferenceResolver {
  private readonly _apiModel: ApiModel;

  public constructor(apiModel: ApiModel) {
    this._apiModel = apiModel;
  }

  public resolve(
    declarationReference: DocDeclarationReference,
    contextApiItem: ApiItem | undefined
  ): IResolveDeclarationReferenceResult {
    const result: IResolveDeclarationReferenceResult = {
      resolvedApiItem: undefined,
      errorMessage: undefined,
    };

    let apiPackage: ApiPackage | undefined = undefined;

    // Is this an absolute reference?
    if (declarationReference.packageName !== undefined) {
      apiPackage = this._apiModel.tryGetPackageByName(declarationReference.packageName);
      if (apiPackage === undefined) {
        result.errorMessage = `The package "${declarationReference.packageName}" could not be located`;
        return result;
      }
    } else {
      // If the package name is omitted, try to infer it from the context
      if (contextApiItem !== undefined) {
        apiPackage = contextApiItem.getAssociatedPackage();
      }

      if (apiPackage === undefined) {
        result.errorMessage =
          `The reference does not include a package name, and the package could not be inferred` +
          ` from the context`;
        return result;
      }
    }

    const importPath: string = declarationReference.importPath || '';

    const foundEntryPoints: ReadonlyArray<ApiEntryPoint> = apiPackage.findEntryPointsByPath(importPath);
    if (foundEntryPoints.length !== 1) {
      result.errorMessage = `The import path "${importPath}" could not be resolved`;
      return result;
    }

    let currentItem: ApiItem = foundEntryPoints[0];

    // Now search for the member reference
    for (const memberReference of declarationReference.memberReferences) {
      if (memberReference.memberSymbol !== undefined) {
        result.errorMessage = `Symbols are not yet supported in declaration references`;
        return result;
      }

      if (memberReference.memberIdentifier === undefined) {
        result.errorMessage = `Missing member identifier`;
        return result;
      }

      const identifier: string = memberReference.memberIdentifier.identifier;

      if (!ApiItemContainerMixin.isBaseClassOf(currentItem)) {
        // For example, {@link MyClass.myMethod.X} is invalid because methods cannot contain members
        result.errorMessage =
          `Unable to resolve ${JSON.stringify(identifier)} because ${JSON.stringify(currentItem)}` +
          ` cannot act as a container`;
        return result;
      }

      const foundMembers: ReadonlyArray<ApiItem> = currentItem.findMembersByName(identifier);
      if (foundMembers.length === 0) {
        result.errorMessage = `The member reference ${JSON.stringify(identifier)} was not found`;
        return result;
      }
      if (foundMembers.length > 1) {
        if (memberReference.selector && memberReference.selector.selectorKind === SelectorKind.Index) {
          const selectedMembers: ApiItem[] = [];

          const selectorOverloadIndex: number = parseInt(memberReference.selector.selector);
          for (const foundMember of foundMembers) {
            if (ApiParameterListMixin.isBaseClassOf(foundMember)) {
              if (foundMember.overloadIndex === selectorOverloadIndex) {
                selectedMembers.push(foundMember);
              }
            }
          }

          if (selectedMembers.length === 0) {
            result.errorMessage =
              `An overload for ${JSON.stringify(identifier)} was not found that matches` +
              ` the TSDoc selector ":${selectorOverloadIndex}"`;
            return result;
          }

          if (selectedMembers.length === 1) {
            result.resolvedApiItem = selectedMembers[0];
            return result;
          }
        }

        // TODO: Support other TSDoc selectors
        result.errorMessage = `The member reference ${JSON.stringify(identifier)} was ambiguous`;
        return result;
      }

      currentItem = foundMembers[0];
    }
    result.resolvedApiItem = currentItem;
    return result;
  }
}
