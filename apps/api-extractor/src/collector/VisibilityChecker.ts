import * as path from 'path';
import * as ts from 'typescript';

import { Collector } from './Collector';
import { AstSymbol } from '../analyzer/AstSymbol';
import { AstDeclaration } from '../analyzer/AstDeclaration';
// import { SymbolMetadata } from './SymbolMetadata';
import { CollectorEntity } from './CollectorEntity';
import { ExtractorMessageId } from '../api/ExtractorMessageId';

export class VisibilityChecker {

  public static check(collector: Collector): void {
    const alreadyWarnedSymbols: Set<AstSymbol> = new Set<AstSymbol>();

    for (const entity of collector.entities) {
      if (entity.astEntity instanceof AstSymbol) {
        if (entity.exported) {
          entity.astEntity.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
            VisibilityChecker._checkReferences(collector, astDeclaration, alreadyWarnedSymbols);
          });

        }
      }
    }
  }

  private static _checkReferences(collector: Collector, astDeclaration: AstDeclaration,
    alreadyWarnedSymbols: Set<AstSymbol>): void {

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
            // const metadata: SymbolMetadata = collector.fetchMetadata(referencedEntity);
            return;
          } else {
            const entryPointFilename: string = path.basename(collector.workingPackage.entryPointSourceFile.fileName);

            if (!alreadyWarnedSymbols.has(referencedEntity)) {
              alreadyWarnedSymbols.add(referencedEntity);

              // The main usage scenario for ECMAScript symbols is to attach private data to a JavaScript object,
              // so as a special case, we do NOT report them as forgotten exports.
              if (!VisibilityChecker._isEcmaScriptSymbol(referencedEntity)) {

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
