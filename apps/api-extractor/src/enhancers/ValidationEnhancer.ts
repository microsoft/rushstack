// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as ts from 'typescript';

import { Collector } from '../collector/Collector';
import { AstSymbol } from '../analyzer/AstSymbol';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { DeclarationMetadata } from '../collector/DeclarationMetadata';
import { SymbolMetadata } from '../collector/SymbolMetadata';
import { CollectorEntity } from '../collector/CollectorEntity';
import { ExtractorMessageId } from '../api/ExtractorMessageId';
import { ReleaseTag } from '@microsoft/api-extractor-model';

export class ValidationEnhancer {

  public static analyze(collector: Collector): void {
    const alreadyWarnedSymbols: Set<AstSymbol> = new Set<AstSymbol>();

    for (const entity of collector.entities) {
      if (entity.astEntity instanceof AstSymbol) {
        if (entity.exported) {
          entity.astEntity.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
            ValidationEnhancer._checkReferences(collector, astDeclaration, alreadyWarnedSymbols);
          });

          ValidationEnhancer._checkForInternalUnderscore(collector, entity, entity.astEntity);
        }
      }
    }
  }

  private static _checkForInternalUnderscore(
    collector: Collector,
    collectorEntity: CollectorEntity,
    astSymbol: AstSymbol
  ): void {
    let containsInternal: boolean = false;
    for (let i: number = 0; i < astSymbol.astDeclarations.length; i++) {
      const astDeclaration: AstDeclaration = astSymbol.astDeclarations[i];
      const declarationMetadata: DeclarationMetadata = collector.fetchMetadata(astDeclaration);

      if (
        (containsInternal && declarationMetadata.effectiveReleaseTag !== ReleaseTag.Internal) ||
        (!containsInternal && declarationMetadata.effectiveReleaseTag === ReleaseTag.Internal && i > 0)
      ) {
        const exportName: string = astDeclaration.astSymbol.localName;
        collector.messageRouter.addAnalyzerIssue(
          ExtractorMessageId.InternalMixedReleaseTag,
          `Mixed release tags are not allowed for overload "${exportName}" when one is marked as @internal`,
          astDeclaration
        );
      } else if (declarationMetadata.effectiveReleaseTag === ReleaseTag.Internal) {
        containsInternal = true;
      }

      if (
        declarationMetadata.effectiveReleaseTag === ReleaseTag.Internal &&
        !declarationMetadata.releaseTagSameAsParent
      ) {
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
  }

  private static _checkReferences(
    collector: Collector,
    astDeclaration: AstDeclaration,
    alreadyWarnedSymbols: Set<AstSymbol>
  ): void {
    const declarationMetadata: DeclarationMetadata = collector.fetchMetadata(astDeclaration);
    const declarationReleaseTag: ReleaseTag = declarationMetadata.effectiveReleaseTag;

    for (const referencedEntity of astDeclaration.referencedAstEntities) {

      if (referencedEntity instanceof AstSymbol) {
        // If this is e.g. a member of a namespace, then we need to be checking the top-level scope to see
        // whether it's exported.
        //
        // TODO: Technically we should also check each of the nested scopes along the way.
        const rootSymbol: AstSymbol = referencedEntity.rootAstSymbol;

        if (!rootSymbol.isExternal) {
          const collectorEntity: CollectorEntity | undefined = collector.tryGetCollectorEntity(rootSymbol);

          if (collectorEntity && collectorEntity.exported) {
            const referencedMetadata: SymbolMetadata = collector.fetchMetadata(referencedEntity);
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
