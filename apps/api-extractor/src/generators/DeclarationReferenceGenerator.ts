// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-bitwise */
import * as ts from 'typescript';
import {
  DeclarationReference,
  ModuleSource,
  GlobalSource,
  Navigation,
  Meaning
} from '@microsoft/tsdoc/lib/beta/DeclarationReference';
import { PackageJsonLookup, INodePackageJson, InternalError } from '@rushstack/node-core-library';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { TypeScriptInternals } from '../analyzer/TypeScriptInternals';

export class DeclarationReferenceGenerator {
  public static readonly unknownReference: string = '?';

  private _packageJsonLookup: PackageJsonLookup;
  private _workingPackageName: string;
  private _program: ts.Program;
  private _typeChecker: ts.TypeChecker;

  public constructor(packageJsonLookup: PackageJsonLookup, workingPackageName: string, program: ts.Program,
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
      const isExpression: boolean = DeclarationReferenceGenerator._isInExpressionContext(node);
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

  private static _isInExpressionContext(node: ts.Node): boolean {
    switch (node.parent.kind) {
      case ts.SyntaxKind.TypeQuery: return true;
      case ts.SyntaxKind.QualifiedName: return DeclarationReferenceGenerator._isInExpressionContext(node.parent);
      default: return false;
    }
  }

  private static _isExternalModuleSymbol(symbol: ts.Symbol): boolean {
    return !!(symbol.flags & ts.SymbolFlags.ValueModule)
      && symbol.valueDeclaration !== undefined
      && ts.isSourceFile(symbol.valueDeclaration);
  }

  private static _isSameSymbol(left: ts.Symbol | undefined, right: ts.Symbol): boolean {
    return left === right
      || !!(left && left.valueDeclaration && right.valueDeclaration && left.valueDeclaration === right.valueDeclaration);
  }

  private static _getNavigationToSymbol(symbol: ts.Symbol): Navigation | 'global' {
    const parent: ts.Symbol | undefined = TypeScriptInternals.getSymbolParent(symbol);
    // First, try to determine navigation to symbol via its parent.
    if (parent) {
      if (parent.exports && DeclarationReferenceGenerator._isSameSymbol(parent.exports.get(symbol.escapedName), symbol)) {
        return Navigation.Exports;
      }
      if (parent.members && DeclarationReferenceGenerator._isSameSymbol(parent.members.get(symbol.escapedName), symbol)) {
        return Navigation.Members;
      }
      if (parent.globalExports && DeclarationReferenceGenerator._isSameSymbol(parent.globalExports.get(symbol.escapedName), symbol)) {
        return 'global';
      }
    }

    // Next, try determining navigation to symbol by its node
    if (symbol.valueDeclaration) {
      const declaration: ts.Declaration = ts.isBindingElement(symbol.valueDeclaration)
        ? ts.walkUpBindingElementsAndPatterns(symbol.valueDeclaration)
        : symbol.valueDeclaration;
      if (ts.isClassElement(declaration) && ts.isClassLike(declaration.parent)) {
        // class members are an "export" if they have the static modifier.
        return ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Static
          ? Navigation.Exports
          : Navigation.Members;
      }
      if (ts.isTypeElement(declaration) || ts.isObjectLiteralElement(declaration)) {
        // type and object literal element members are just members
        return Navigation.Members;
      }
      if (ts.isEnumMember(declaration)) {
        // enum members are exports
        return Navigation.Exports;
      }
      if (ts.isExportSpecifier(declaration)
        || ts.isExportAssignment(declaration)
        || ts.isExportSpecifier(declaration)
        || ts.isExportDeclaration(declaration)
        || ts.isNamedExports(declaration)
      ) {
        return Navigation.Exports;
      }
      // declarations are exports if they have an `export` modifier.
      if (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) {
        return Navigation.Exports;
      }
      if (ts.isSourceFile(declaration.parent) && !ts.isExternalModule(declaration.parent)) {
        // declarations in a source file are global if the source file is not a module.
        return 'global';
      }
    }
    // all other declarations are locals
    return Navigation.Locals;
  }

  private static _getMeaningOfSymbol(symbol: ts.Symbol, meaning: ts.SymbolFlags): Meaning | undefined {
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

  private _symbolToDeclarationReference(symbol: ts.Symbol, meaning: ts.SymbolFlags, includeModuleSymbols: boolean
    ): DeclarationReference | undefined {

    let followedSymbol: ts.Symbol = symbol;
    if (followedSymbol.flags & ts.SymbolFlags.ExportValue) {
      followedSymbol = this._typeChecker.getExportSymbolOfSymbol(followedSymbol);
    }
    if (followedSymbol.flags & ts.SymbolFlags.Alias) {
      followedSymbol = this._typeChecker.getAliasedSymbol(followedSymbol);
    }

    if (DeclarationReferenceGenerator._isExternalModuleSymbol(followedSymbol)) {
      if (!includeModuleSymbols) {
        return undefined;
      }
      const sourceFile: ts.SourceFile | undefined =
        followedSymbol.declarations
        && followedSymbol.declarations[0]
        && followedSymbol.declarations[0].getSourceFile();
      return new DeclarationReference(this._sourceFileToModuleSource(sourceFile));
    }

    // Do not generate a declaration reference for a type parameter.
    if (followedSymbol.flags & ts.SymbolFlags.TypeParameter) {
      return undefined;
    }

    const parent: ts.Symbol | undefined = TypeScriptInternals.getSymbolParent(followedSymbol);
    let parentRef: DeclarationReference | undefined;
    if (parent) {
      parentRef = this._symbolToDeclarationReference(parent, ts.SymbolFlags.Namespace, /*includeModuleSymbols*/ true);
    } else {
      // this may be a local symbol in a module...
      const sourceFile: ts.SourceFile | undefined =
        followedSymbol.declarations
        && followedSymbol.declarations[0]
        && followedSymbol.declarations[0].getSourceFile();
      if (sourceFile && ts.isExternalModule(sourceFile)) {
        parentRef = new DeclarationReference(this._sourceFileToModuleSource(sourceFile));
      } else {
        parentRef = new DeclarationReference(GlobalSource.instance);
      }
    }

    if (parentRef === undefined) {
      return undefined;
    }

    let localName: string = followedSymbol.name;
    if (followedSymbol.escapedName === ts.InternalSymbolName.Constructor) {
      localName = 'constructor';
    } else {
      const wellKnownName: string | undefined = TypeScriptHelpers.tryDecodeWellKnownSymbolName(followedSymbol.escapedName);
      if (wellKnownName) {
        // TypeScript binds well-known ECMAScript symbols like 'Symbol.iterator' as '__@iterator'.
        // This converts a string like '__@iterator' into the property name '[Symbol.iterator]'.
        localName = wellKnownName;
      } else if (TypeScriptHelpers.isUniqueSymbolName(followedSymbol.escapedName)) {
        for (const decl of followedSymbol.declarations || []) {
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

    let navigation: Navigation | 'global' = DeclarationReferenceGenerator._getNavigationToSymbol(followedSymbol);
    if (navigation === 'global') {
      if (parentRef.source !== GlobalSource.instance) {
        parentRef = new DeclarationReference(GlobalSource.instance);
      }
      navigation = Navigation.Exports;
    }

    return parentRef
      .addNavigationStep(navigation, localName)
      .withMeaning(DeclarationReferenceGenerator._getMeaningOfSymbol(followedSymbol, meaning));
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

