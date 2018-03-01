// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { IAstItemOptions } from './AstItem';
import { AstItemContainer } from './AstItemContainer';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';
import { AstStructuredType } from './AstStructuredType';
import { AstEnum } from './AstEnum';
import { AstFunction } from './AstFunction';

/**
  * This is an abstract base class for AstPackage and AstNamespace.
  */
export abstract class AstModule extends AstItemContainer {

  protected processModuleExport(exportSymbol: ts.Symbol): void {
    const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(exportSymbol, this.typeChecker);

    if (!followedSymbol.declarations) {
      // This is an API Extractor bug, but it could happen e.g. if we upgrade to a new
      // version of the TypeScript compiler that introduces new AST variations that we
      // haven't tested before.
      this.reportWarning(`Definition with no declarations: ${exportSymbol.name}`);
      return;
    }

    for (const declaration of followedSymbol.declarations) {
      const options: IAstItemOptions = {
        context: this.context,
        declaration,
        declarationSymbol: followedSymbol,
        exportSymbol
      };

      if (followedSymbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)) {
        this.addMemberItem(new AstStructuredType(options));
      } else if (followedSymbol.flags & ts.SymbolFlags.ValueModule) {
        this.addMemberItem(new AstNamespace(options)); // tslint:disable-line:no-use-before-declare
      } else if (followedSymbol.flags & ts.SymbolFlags.Function) {
        this.addMemberItem(new AstFunction(options));
      } else if (followedSymbol.flags & ts.SymbolFlags.Enum) {
        this.addMemberItem(new AstEnum(options));
      } else {
        this.reportWarning(`Unsupported export: ${exportSymbol.name}`);
      }
    }
  }
}

// This is defer imported to break the circular dependency
import { AstNamespace } from './AstNamespace';
