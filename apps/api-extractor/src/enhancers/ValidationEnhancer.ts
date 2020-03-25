// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as ts from 'typescript';

import { Collector } from '../collector/Collector';
import { AstSymbol } from '../analyzer/AstSymbol';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { ApiItemMetadata } from '../collector/ApiItemMetadata';
import { SymbolMetadata } from '../collector/SymbolMetadata';
import { CollectorEntity } from '../collector/CollectorEntity';
import { ExtractorMessageId } from '../api/ExtractorMessageId';
import { ReleaseTag } from '@microsoft/api-extractor-model';
import { AstImportAsModule } from '../analyzer/AstImportAsModule';

export class ValidationEnhancer {

  public static analyze(collector: Collector): void {
    const alreadyWarnedSymbols: Set<AstSymbol> = new Set<AstSymbol>();

    for (const entity of collector.entities) {
      if (entity.astEntity instanceof AstSymbol) {
        if (entity.exported) {
          entity.astEntity.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
            ValidationEnhancer._checkReferences(collector, astDeclaration, alreadyWarnedSymbols);
          });

          const symbolMetadata: SymbolMetadata = collector.fetchSymbolMetadata(entity.astEntity);
          ValidationEnhancer._checkForInternalUnderscore(collector, entity, entity.astEntity, symbolMetadata);
          ValidationEnhancer._checkForInconsistentReleaseTags(collector, entity.astEntity, symbolMetadata);
        }
      }

      if (entity.astEntity instanceof AstImportAsModule) {
        // TODO [MA]: validation for local module import
      }
    }
  }

  private static _checkForInternalUnderscore(
    collector: Collector,
    collectorEntity: CollectorEntity,
    astSymbol: AstSymbol,
    symbolMetadata: SymbolMetadata
  ): void {

    let needsUnderscore: boolean = false;

    if (symbolMetadata.maxEffectiveReleaseTag === ReleaseTag.Internal) {
      if (!astSymbol.parentAstSymbol) {
        // If it's marked as @internal and has no parent, then it needs and underscore.
        // We use maxEffectiveReleaseTag because a merged declaration would NOT need an underscore in a case like this:
        //
        //   /** @public */
        //   export enum X { }
        //
        //   /** @internal */
        //   export namespace X { }
        //
        // (The above normally reports an error "ae-different-release-tags", but that may be suppressed.)
        needsUnderscore = true;
      } else {
        // If it's marked as @internal and the parent isn't obviously already @internal, then it needs an underscore.
        //
        // For example, we WOULD need an underscore for a merged declaration like this:
        //
        //   /** @internal */
        //   export namespace X {
        //     export interface _Y { }
        //   }
        //
        //   /** @public */
        //   export class X {
        //     /** @internal */
        //     public static _Y(): void { }   // <==== different from parent
        //   }
        const parentSymbolMetadata: SymbolMetadata = collector.fetchSymbolMetadata(astSymbol);
        if (parentSymbolMetadata.maxEffectiveReleaseTag > ReleaseTag.Internal) {
          needsUnderscore = true;
        }
      }
    }

    if (needsUnderscore) {
      for (const exportName of collectorEntity.exportNames) {
        if (exportName[0] !== '_') {
          collector.messageRouter.addAnalyzerIssue(
            ExtractorMessageId.InternalMissingUnderscore,
            `The name "${exportName}" should be prefixed with an underscore`
            + ` because the declaration is marked as @internal`,
            astSymbol,
            { exportName }
          );
        }
      }
    }
  }

  private static _checkForInconsistentReleaseTags(
    collector: Collector,
    astSymbol: AstSymbol,
    symbolMetadata: SymbolMetadata
  ): void {
    if (astSymbol.isExternal) {
      // For now, don't report errors for external code.  If the developer cares about it, they should run
      // API Extractor separately on the external project
      return;
    }

    // Normally we will expect all release tags to be the same.  Arbitrarily we choose the maxEffectiveReleaseTag
    // as the thing they should all match.
    const expectedEffectiveReleaseTag: ReleaseTag = symbolMetadata.maxEffectiveReleaseTag;

    // This is set to true if we find a declaration whose release tag is different from expectedEffectiveReleaseTag
    let mixedReleaseTags: boolean = false;

    // This is set to false if we find a declaration that is not a function/method overload
    let onlyFunctionOverloads: boolean = true;

    // This is set to true if we find a declaration that is @internal
    let anyInternalReleaseTags: boolean = false;

    for (const astDeclaration of astSymbol.astDeclarations) {
      const apiItemMetadata: ApiItemMetadata = collector.fetchApiItemMetadata(astDeclaration);
      const effectiveReleaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;

      switch (astDeclaration.declaration.kind) {
        case ts.SyntaxKind.FunctionDeclaration:
        case ts.SyntaxKind.MethodDeclaration:
          break;
        default:
          onlyFunctionOverloads = false;
      }

      if (effectiveReleaseTag !== expectedEffectiveReleaseTag) {
        mixedReleaseTags = true;
      }

      if (effectiveReleaseTag === ReleaseTag.Internal) {
        anyInternalReleaseTags = true;
      }
    }

    if (mixedReleaseTags) {
      if (!onlyFunctionOverloads) {
        collector.messageRouter.addAnalyzerIssue(
          ExtractorMessageId.DifferentReleaseTags,
          'This symbol has another declaration with a different release tag',
          astSymbol
        );
      }

      if (anyInternalReleaseTags) {
        collector.messageRouter.addAnalyzerIssue(
          ExtractorMessageId.InternalMixedReleaseTag,
          `Mixed release tags are not allowed for "${astSymbol.localName}" because one of its declarations` +
          ` is marked as @internal`,
          astSymbol
        );
      }
    }
  }

  private static _checkReferences(
    collector: Collector,
    astDeclaration: AstDeclaration,
    alreadyWarnedSymbols: Set<AstSymbol>
  ): void {
    const apiItemMetadata: ApiItemMetadata = collector.fetchApiItemMetadata(astDeclaration);
    const declarationReleaseTag: ReleaseTag = apiItemMetadata.effectiveReleaseTag;

    for (const referencedEntity of astDeclaration.referencedAstEntities) {

      if (referencedEntity instanceof AstSymbol) {
        // If this is e.g. a member of a namespace, then we need to be checking the top-level scope to see
        // whether it's exported.
        //
        // TODO: Technically we should also check each of the nested scopes along the way.
        const rootSymbol: AstSymbol = referencedEntity.rootAstSymbol;

        if (!rootSymbol.isExternal) {
          // TODO: consider exported by local module import
          const collectorEntity: CollectorEntity | undefined = collector.tryGetCollectorEntity(rootSymbol);

          if (collectorEntity && collectorEntity.exported) {
            const referencedMetadata: SymbolMetadata = collector.fetchSymbolMetadata(referencedEntity);
            const referencedReleaseTag: ReleaseTag = referencedMetadata.maxEffectiveReleaseTag;

            if (ReleaseTag.compare(declarationReleaseTag, referencedReleaseTag) > 0) {
              collector.messageRouter.addAnalyzerIssue(ExtractorMessageId.IncompatibleReleaseTags,
                `The symbol "${astDeclaration.astSymbol.localName}"`
                + ` is marked as ${ReleaseTag.getTagName(declarationReleaseTag)},`
                + ` but its signature references "${referencedEntity.localName}"`
                + ` which is marked as ${ReleaseTag.getTagName(referencedReleaseTag)}`,
                astDeclaration);
            }
          } else {
            const entryPointFilename: string = path.basename(collector.workingPackage.entryPointSourceFile.fileName);

            if (!alreadyWarnedSymbols.has(referencedEntity)) {
              alreadyWarnedSymbols.add(referencedEntity);

              // The main usage scenario for ECMAScript symbols is to attach private data to a JavaScript object,
              // so as a special case, we do NOT report them as forgotten exports.
              if (!ValidationEnhancer._isEcmaScriptSymbol(referencedEntity)) {

                collector.messageRouter.addAnalyzerIssue(ExtractorMessageId.ForgottenExport,
                  `The symbol "${rootSymbol.localName}" needs to be exported`
                    + ` by the entry point ${entryPointFilename}`,
                  astDeclaration);
              }

            }

          }
        }
      }

      if (referencedEntity instanceof AstImportAsModule) {
        // TODO [MA]: add validation for local import
      }
    }
  }

  // Detect an AstSymbol that refers to an ECMAScript symbol declaration such as:
  //
  // const mySymbol: unique symbol = Symbol('mySymbol');
  private static _isEcmaScriptSymbol(astSymbol: AstSymbol): boolean {
    if (astSymbol.astDeclarations.length !== 1) {
      return false;
    }

    // We are matching a form like this:
    //
    // - VariableDeclaration:
    //   - Identifier:  pre=[mySymbol]
    //   - ColonToken:  pre=[:] sep=[ ]
    //   - TypeOperator:
    //     - UniqueKeyword:  pre=[unique] sep=[ ]
    //     - SymbolKeyword:  pre=[symbol]
    const astDeclaration: AstDeclaration = astSymbol.astDeclarations[0];
    if (ts.isVariableDeclaration(astDeclaration.declaration)) {
      const variableTypeNode: ts.TypeNode | undefined = astDeclaration.declaration.type;
      if (variableTypeNode) {
        for (const token of variableTypeNode.getChildren()) {
          if (token.kind === ts.SyntaxKind.SymbolKeyword) {
            return true;
          }
        }
      }
    }

    return false;
  }

}
