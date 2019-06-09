// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// tslint:disable:no-bitwise
import * as ts from 'typescript';
import {
  DeclarationReference,
  ModuleSource,
  GlobalSource,
  Navigation,
  Meaning
} from '@microsoft/tsdoc/lib/beta/DeclarationReference';
import { PackageJsonLookup, INodePackageJson, InternalError } from '@microsoft/node-core-library';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { TypeScriptInternals } from '../analyzer/TypeScriptInternals';

export class DeclarationReferenceGenerator {
  public static readonly unknownReference: string = '?';

  private _packageJsonLookup: PackageJsonLookup;
  private _workingPackageName: string;
  private _program: ts.Program;
  private _typeChecker: ts.TypeChecker;

  constructor(packageJsonLookup: PackageJsonLookup, workingPackageName: string, program: ts.Program,
    typeChecker: ts.TypeChecker) {

    this._packageJsonLookup = packageJsonLookup;
    this._workingPackageName = workingPackageName;
    this._program = program;
    this._typeChecker = typeChecker;
  }

  /**
   * Gets the UID for a TypeScript Identifier that references a type.
   */
  public getDeclarationReferenceForIdentifier(node: ts.Identifier): DeclarationReference | undefined {
    const symbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(node);
    if (symbol !== undefined) {
      const isExpression: boolean = isInExpressionContext(node);
      return this.getDeclarationReferenceForSymbol(symbol, isExpression ? ts.SymbolFlags.Value : ts.SymbolFlags.Type)
        || this.getDeclarationReferenceForSymbol(symbol, isExpression ? ts.SymbolFlags.Type : ts.SymbolFlags.Value)
        || this.getDeclarationReferenceForSymbol(symbol, ts.SymbolFlags.Namespace);
    }
  }

  /**
   * Gets the DeclarationReference for a TypeScript Symbol for a given meaning.
   */
  public getDeclarationReferenceForSymbol(symbol: ts.Symbol, meaning: ts.SymbolFlags
    ): DeclarationReference | undefined {
    return this._symbolToDeclarationReference(symbol, meaning, /*includeModuleSymbols*/ false);
  }

  private _symbolToDeclarationReference(symbol: ts.Symbol, meaning: ts.SymbolFlags, includeModuleSymbols: boolean
    ): DeclarationReference | undefined {
    if (symbol.flags & ts.SymbolFlags.ExportValue) {
      symbol = this._typeChecker.getExportSymbolOfSymbol(symbol);
    }
    if (symbol.flags & ts.SymbolFlags.Alias) {
      symbol = this._typeChecker.getAliasedSymbol(symbol);
    }

    if (isExternalModuleSymbol(symbol)) {
      if (!includeModuleSymbols) {
        return undefined;
      }
      const sourceFile: ts.SourceFile | undefined =
        symbol.declarations
        && symbol.declarations[0]
        && symbol.declarations[0].getSourceFile();
      return new DeclarationReference(this._sourceFileToModuleSource(sourceFile));
    }

    if (symbol.flags & ts.SymbolFlags.TypeParameter) {
      return DeclarationReference.parse(DeclarationReference.escapeComponentString(symbol.name));
    }

    const parent: ts.Symbol | undefined = TypeScriptInternals.getSymbolParent(symbol);
    const parentRef: DeclarationReference | undefined = parent
      ? this._symbolToDeclarationReference(parent, ts.SymbolFlags.Namespace, /*includeModuleSymbols*/ true)
      : new DeclarationReference(GlobalSource.instance);

    if (parentRef === undefined) {
      return undefined;
    }

    let localName: string = symbol.name;
    if (symbol.escapedName === ts.InternalSymbolName.Constructor) {
      localName = 'constructor';
    } else {
      const wellKnownName: string | undefined = TypeScriptHelpers.tryDecodeWellKnownSymbolName(symbol.escapedName);
      if (wellKnownName) {
        // TypeScript binds well-known ECMAScript symbols like 'Symbol.iterator' as '__@iterator'.
        // This converts a string like '__@iterator' into the property name '[Symbol.iterator]'.
        localName = wellKnownName;
      } else if (TypeScriptHelpers.isUniqueSymbolName(symbol.escapedName)) {
        for (const decl of symbol.declarations || []) {
          const declName: ts.DeclarationName | undefined = ts.getNameOfDeclaration(decl);
          if (declName && ts.isComputedPropertyName(declName)) {
            const lateName: string | undefined = TypeScriptHelpers.tryGetLateBoundName(declName);
            if (lateName !== undefined) {
              localName = lateName;
              break;
            }
          }
        }
      }
    }

    const navigation: Navigation = isTypeMemberOrNonStaticClassMember(symbol)
      ? Navigation.Members
      : Navigation.Exports;

    return parentRef
      .addNavigationStep(navigation, localName)
      .withMeaning(getMeaningOfSymbol(symbol, meaning));
  }

  private _getPackageName(sourceFile: ts.SourceFile): string {
    if (this._program.isSourceFileFromExternalLibrary(sourceFile)) {
      const packageJson: INodePackageJson | undefined = this._packageJsonLookup
        .tryLoadNodePackageJsonFor(sourceFile.fileName);

      if (packageJson && packageJson.name) {
        return packageJson.name;
      }
      return DeclarationReferenceGenerator.unknownReference;
    }
    return this._workingPackageName;
  }

  private _sourceFileToModuleSource(sourceFile: ts.SourceFile | undefined): GlobalSource | ModuleSource {
    if (sourceFile && ts.isExternalModule(sourceFile)) {
      return new ModuleSource(this._getPackageName(sourceFile));
    }
    return GlobalSource.instance;
  }
}

function isExternalModuleSymbol(symbol: ts.Symbol): boolean {
  return !!(symbol.flags & ts.SymbolFlags.ValueModule)
    && symbol.valueDeclaration !== undefined
    && ts.isSourceFile(symbol.valueDeclaration);
}

function isTypeMemberOrNonStaticClassMember(symbol: ts.Symbol): boolean {
  if (symbol.valueDeclaration) {
    if (ts.isClassLike(symbol.valueDeclaration.parent)) {
      return ts.isClassElement(symbol.valueDeclaration)
        && !(ts.getCombinedModifierFlags(symbol.valueDeclaration) & ts.ModifierFlags.Static);
    }
    if (ts.isInterfaceDeclaration(symbol.valueDeclaration.parent)) {
      return ts.isTypeElement(symbol.valueDeclaration);
    }
  }
  return false;
}

function getMeaningOfSymbol(symbol: ts.Symbol, meaning: ts.SymbolFlags): Meaning | undefined {
  if (symbol.flags & meaning & ts.SymbolFlags.Class) {
    return Meaning.Class;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.Enum) {
    return Meaning.Enum;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.Interface) {
    return Meaning.Interface;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.TypeAlias) {
    return Meaning.TypeAlias;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.Function) {
    return Meaning.Function;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.Variable) {
    return Meaning.Variable;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.Module) {
    return Meaning.Namespace;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.ClassMember) {
    return Meaning.Member;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.Constructor) {
    return Meaning.Constructor;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.EnumMember) {
    return Meaning.Member;
  }
  if (symbol.flags & meaning & ts.SymbolFlags.Signature) {
    if (symbol.escapedName === ts.InternalSymbolName.Call) {
      return Meaning.CallSignature;
    }
    if (symbol.escapedName === ts.InternalSymbolName.New) {
      return Meaning.ConstructSignature;
    }
    if (symbol.escapedName === ts.InternalSymbolName.Index) {
      return Meaning.IndexSignature;
    }
  }
  if (symbol.flags & meaning & ts.SymbolFlags.TypeParameter) {
    // This should have already been handled in `getDeclarationReferenceOfSymbol`.
    throw new InternalError('Not supported.');
  }
  return undefined;
}

function isInExpressionContext(node: ts.Node): boolean {
  switch (node.parent.kind) {
    case ts.SyntaxKind.TypeQuery: return true;
    case ts.SyntaxKind.QualifiedName: return isInExpressionContext(node.parent);
    default: return false;
  }
}