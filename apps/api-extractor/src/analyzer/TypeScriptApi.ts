// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * TypeScript 7 no longer exposes the compiler API from the `typescript` package entry point;
 * that entry point now only reports the compiler version.  The API is instead published under
 * the `typescript/unstable/*` subpath exports:
 *
 * - `typescript/unstable/ast` provides the syntax tree types, the `SyntaxKind` and flag enums,
 *   the `isXxx()` type guards, the scanner, and the JSDoc helpers.
 * - `typescript/unstable/sync` provides the semantic layer (`API`, `Project`, `Program`,
 *   `Checker`, `Symbol`, `Type`, `Emitter`), which communicates with an out-of-process
 *   compiler server.
 *
 * This module re-exports those two surfaces under a single namespace, so that the rest of
 * API Extractor can continue to write `ts.SourceFile`, `ts.SyntaxKind.ClassDeclaration`, etc.
 * Names that TypeScript 7 renamed are aliased back to their TypeScript 5 spellings
 * (for example `Checker` is exported as `TypeChecker`).
 */

export * from 'typescript/unstable/ast';

/**
 * In TypeScript 7 the `typescript` package entry point only reports the compiler version.
 */
export { version, versionMajorMinor } from 'typescript';

export {
  API,
  Project,
  Program,
  Checker as TypeChecker,
  Emitter,
  Snapshot,
  Symbol,
  Signature,
  NodeHandle,
  SymbolFlags,
  ModuleKind,
  DiagnosticCategory,
  TypeFlags,
  ObjectFlags,
  NodeBuilderFlags,
  SignatureKind
} from 'typescript/unstable/sync';

export type {
  CompilerOptions,
  Diagnostic,
  DocumentIdentifier,
  SourceFileMetadata,
  Type,
  TypeReference,
  UnionType,
  IntersectionType,
  InterfaceType,
  IndexInfo,
  JSDocTagInfo
} from 'typescript/unstable/sync';

import {
  isParameterDeclaration,
  isStringLiteral,
  isNoSubstitutionTemplateLiteral,
  ModifierFlags,
  SyntaxKind,
  type DeclarationName,
  type MethodSignatureDeclaration,
  type NoSubstitutionTemplateLiteral,
  type Node,
  type PropertySignatureDeclaration,
  type SourceFile,
  type StringLiteral
} from 'typescript/unstable/ast';

/**
 * TypeScript 7 renamed several node interfaces by appending `Declaration`.  These aliases
 * preserve the TypeScript 5 spellings that API Extractor uses.
 */
export type MethodSignature = MethodSignatureDeclaration;

/** {@inheritDoc MethodSignature} */
export type PropertySignature = PropertySignatureDeclaration;

/**
 * A string literal that may be used as a module specifier.  TypeScript 7 does not declare
 * this union or its type guard.
 */
export type StringLiteralLike = StringLiteral | NoSubstitutionTemplateLiteral;

/** A declaration that may have a name.  TypeScript 7 does not declare this interface. */
export interface NamedDeclaration extends Node {
  readonly name?: DeclarationName;
}

/** Type guard for {@link StringLiteralLike}. */
export function isStringLiteralLike(node: Node): node is StringLiteralLike {
  return isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);
}

/** TypeScript 7 renamed `isParameter()` to `isParameterDeclaration()`. */
export const isParameter: typeof isParameterDeclaration = isParameterDeclaration;

/**
 * Returns the name node of a declaration, or `undefined` if it is unnamed.
 * TypeScript 7 does not expose `getNameOfDeclaration()`.
 */
export function getNameOfDeclaration(declaration: Node | undefined): DeclarationName | undefined {
  return (declaration as NamedDeclaration | undefined)?.name;
}

/**
 * Returns whether a source file is an external module (i.e. it has at least one
 * top-level `import` or `export`).  TypeScript 7 does not expose `isExternalModule()`,
 * but it does surface the underlying `externalModuleIndicator` on `SourceFile`.
 */
export function isExternalModule(sourceFile: SourceFile): boolean {
  return sourceFile.externalModuleIndicator !== undefined;
}

/**
 * Computes the modifier flags for a node, including flags contributed by an enclosing
 * `VariableStatement` or `ExportDeclaration`.  TypeScript 7 does not expose
 * `getCombinedModifierFlags()`.
 */
export function getCombinedModifierFlags(node: Node | undefined): ModifierFlags {
  let flags: ModifierFlags = ModifierFlags.None;
  let current: Node | undefined = node;

  // A variable declaration's modifiers live on the enclosing VariableStatement, so walk
  // up through the VariableDeclarationList exactly like the TypeScript 5 implementation.
  while (current) {
    for (const modifier of (current as { modifiers?: readonly Node[] }).modifiers ?? []) {
      flags |= modifierToFlag(modifier.kind);
    }

    if (
      current.kind === SyntaxKind.VariableDeclaration ||
      current.kind === SyntaxKind.VariableDeclarationList
    ) {
      current = current.parent;
    } else {
      break;
    }
  }

  return flags;
}

function modifierToFlag(kind: SyntaxKind): ModifierFlags {
  switch (kind) {
    case SyntaxKind.StaticKeyword:
      return ModifierFlags.Static;
    case SyntaxKind.PublicKeyword:
      return ModifierFlags.Public;
    case SyntaxKind.ProtectedKeyword:
      return ModifierFlags.Protected;
    case SyntaxKind.PrivateKeyword:
      return ModifierFlags.Private;
    case SyntaxKind.AbstractKeyword:
      return ModifierFlags.Abstract;
    case SyntaxKind.AccessorKeyword:
      return ModifierFlags.Accessor;
    case SyntaxKind.ExportKeyword:
      return ModifierFlags.Export;
    case SyntaxKind.DeclareKeyword:
      return ModifierFlags.Ambient;
    case SyntaxKind.ConstKeyword:
      return ModifierFlags.Const;
    case SyntaxKind.DefaultKeyword:
      return ModifierFlags.Default;
    case SyntaxKind.AsyncKeyword:
      return ModifierFlags.Async;
    case SyntaxKind.ReadonlyKeyword:
      return ModifierFlags.Readonly;
    case SyntaxKind.OverrideKeyword:
      return ModifierFlags.Override;
    case SyntaxKind.InKeyword:
      return ModifierFlags.In;
    case SyntaxKind.OutKeyword:
      return ModifierFlags.Out;
    default:
      return ModifierFlags.None;
  }
}
