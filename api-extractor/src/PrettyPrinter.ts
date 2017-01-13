/* tslint:disable:no-bitwise */

import * as ts from 'typescript';

/**
  * Some helper functions for formatting certain TypeScript Compiler API expressions.
  */
export default class PrettyPrinter {
  /**
    * Used for debugging only.  This dumps the TypeScript Compiler's abstract syntax tree.
    */
  public static dumpTree(node: ts.Node, indent: string = ''): void {
    if (node.kind === ts.SyntaxKind.FromKeyword) {
      console.log('**');
    }

    const kindName: string = ts.SyntaxKind[node.kind];
    let trimmedText: string = node.getText()
      .replace(/[\r\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (trimmedText.length > 100) {
      trimmedText = trimmedText.substr(0, 97) + '...';
    }

    console.log(`${indent}${kindName}: [${trimmedText}]`);
    for (const childNode of node.getChildren()) {
      PrettyPrinter.dumpTree(childNode, indent + '  ');
    }
  }

  /**
   * Returns a text representation of the enum flags.
   */
  public static getSymbolFlagsString(flags: ts.SymbolFlags): string {
    return PrettyPrinter._getFlagsString(flags, PrettyPrinter._getSymbolFlagString);
  }

  /**
   * Returns a text representation of the enum flags.
   */
  public static getTypeFlagsString(flags: ts.TypeFlags): string {
    return PrettyPrinter._getFlagsString(flags, PrettyPrinter._getTypeFlagString);
  }

  /**
    * Returns the first line of a potentially nested declaration.
    * For example, for a class definition this might return
    * "class Blah<T> extends BaseClass" without the curly braces.
    * For example, for a function definition, this might return
    * "test(): void;" without the curly braces.
    */
  public static getDeclarationSummary(node: ts.Node): string {
    let result: string = '';
    let previousSyntaxKind: ts.SyntaxKind = ts.SyntaxKind.Unknown;

    for (const childNode of node.getChildren()) {
      switch (childNode.kind) {
        case ts.SyntaxKind.Block:
          result += ';';
          break;
        default:
          if (PrettyPrinter._wantSpaceAfter(previousSyntaxKind)
            && PrettyPrinter._wantSpaceBefore(childNode.kind)) {
            result += ' ';
          }
          result += childNode.getText();
          previousSyntaxKind = childNode.kind;
          break;
      }
    }
    return result;
  }

  /**
   * Throws an exception.  Use this only for unexpected errors, as it may ungracefully terminate the process;
   * ApiItem.reportError() is generally a better option.
   */
  public static throwUnexpectedSyntaxError(errorNode: ts.Node, message: string): void {
    throw new Error(PrettyPrinter.formatFileAndLineNumber(errorNode) + ': ' + message);
  }

  /**
   * Returns a string such as this, based on the context information in the provided node:
   *   "[C:\Folder\File.ts#123]"
   */
  public static formatFileAndLineNumber(node: ts.Node): string {
    const sourceFile: ts.SourceFile = node.getSourceFile();
    const lineAndCharacter: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return `[${sourceFile.fileName}#${lineAndCharacter.line}]`;
  }

  private static _getSymbolFlagString(flag: ts.SymbolFlags): string {
    return ts.SymbolFlags[flag];
  }

  private static _getTypeFlagString(flag: ts.TypeFlags): string {
    return ts.TypeFlags[flag];
  }

  private static _getFlagsString<T>(flags: T, func: (x: T) => string): string {
    /* tslint:disable:no-any */
    let result: string = '';

    let flag: number = 1;
    for (let bit: number = 0; bit < 32; ++bit) {
      if ((flags as any as number) & flag) {
        if (result !== '') {
          result += ', ';
        }
        result += func(flag as any as T);
      }
      flag <<= 1;
    }
    return result === '' ? '???' : result;
    /* tslint:enable:no-any */
  }

  private static _wantSpaceAfter(syntaxKind: ts.SyntaxKind): boolean {
    switch (syntaxKind) {
      case ts.SyntaxKind.Unknown:
      case ts.SyntaxKind.OpenParenToken:
      case ts.SyntaxKind.CloseParenToken:
        return false;
    }
    return true;
  }

  private static _wantSpaceBefore(syntaxKind: ts.SyntaxKind): boolean {
    switch (syntaxKind) {
      case ts.SyntaxKind.Unknown:
      case ts.SyntaxKind.OpenParenToken:
      case ts.SyntaxKind.CloseParenToken:
      case ts.SyntaxKind.ColonToken:
      case ts.SyntaxKind.SemicolonToken:
        return false;
    }
    return true;
  }
}
