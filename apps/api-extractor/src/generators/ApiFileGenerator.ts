// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text, FileSystem } from '@microsoft/node-core-library';
import { ExtractorContext } from '../ExtractorContext';
import { AstStructuredType } from '../ast/AstStructuredType';
import { AstEnum } from '../ast/AstEnum';
import { AstEnumValue } from '../ast/AstEnumValue';
import { AstFunction } from '../ast/AstFunction';
import { AstItem,  AstItemKind } from '../ast/AstItem';
import { AstItemVisitor } from './AstItemVisitor';
import { AstPackage } from '../ast/AstPackage';
import { AstMember } from '../ast/AstMember';
import { AstNamespace } from '../ast/AstNamespace';
import { AstModuleVariable } from '../ast/AstModuleVariable';
import { IndentedWriter } from '../utils/IndentedWriter';
import { ReleaseTag } from '../aedoc/ReleaseTag';

/**
 * For a library such as "example-package", ApiFileGenerator generates the "example-package.api.ts"
 * report which is used to detect API changes.  The output is pseudocode whose syntax is similar
 * but not identical to a "*.d.ts" typings file.  The output file is designed to be committed to
 * Git with a branch policy that will trigger an API review workflow whenever the file contents
 * have changed.  For example, the API file indicates *whether* a class has been documented,
 * but it does not include the documentation text (since minor text changes should not require
 * an API review).
 *
 * @public
 */
export class ApiFileGenerator extends AstItemVisitor {
  protected _indentedWriter: IndentedWriter = new IndentedWriter();

  /**
   * We don't want to require documentation for any properties that occur
   * anywhere within a TypeLiteral. If this value is above 0, then we are
   * visiting something within a TypeLiteral.
   */
  private _insideTypeLiteral: number;

  /**
   * Compares the contents of two API files that were created using ApiFileGenerator,
   * and returns true if they are equivalent.  Note that these files are not normally edited
   * by a human; the "equivalence" comparison here is intended to ignore spurious changes that
   * might be introduced by a tool, e.g. Git newline normalization or an editor that strips
   * whitespace when saving.
   */
  public static areEquivalentApiFileContents(actualFileContent: string, expectedFileContent: string): boolean {
    // NOTE: "\s" also matches "\r" and "\n"
    const normalizedActual: string = actualFileContent.replace(/[\s]+/g, ' ');
    const normalizedExpected: string = expectedFileContent.replace(/[\s]+/g, ' ');
    return normalizedActual === normalizedExpected;
  }

  /**
   * Generates the report and writes it to disk.
   *
   * @param reportFilename - The output filename
   * @param analyzer       - An Analyzer object representing the input project.
   */
  public writeApiFile(reportFilename: string, context: ExtractorContext): void {
    const fileContent: string = this.generateApiFileContent(context);
    FileSystem.writeFile(reportFilename, fileContent);
  }

  public generateApiFileContent(context: ExtractorContext): string {
    this._insideTypeLiteral = 0;
    // Normalize to CRLF
    this.visit(context.package);
    const fileContent: string = Text.convertToCrLf(this._indentedWriter.toString());
    return fileContent;
  }

  protected visitAstStructuredType(astStructuredType: AstStructuredType): void {
    const declarationLine: string = astStructuredType.getDeclarationLine();

    if (astStructuredType.documentation.preapproved) {
      this._indentedWriter.writeLine('// @internal (preapproved)');
      this._indentedWriter.writeLine(declarationLine + ' {');
      this._indentedWriter.writeLine('}');
      return;
    }

    if (astStructuredType.kind !== AstItemKind.TypeLiteral) {
      this._writeAedocSynopsis(astStructuredType);
    }

    this._indentedWriter.writeLine(declarationLine + ' {');

    this._indentedWriter.indentScope(() => {
      if (astStructuredType.kind === AstItemKind.TypeLiteral) {
        // Type literals don't have normal JSDoc.  Write only the warnings,
        // and put them after the '{' since the declaration is nested.
        this._writeWarnings(astStructuredType);
      }

      for (const member of astStructuredType.getSortedMemberItems()) {
        this.visit(member);
        this._indentedWriter.writeLine();
      }
    });

    this._indentedWriter.write('}');
  }

  protected visitAstEnum(astEnum: AstEnum): void {
    this._writeAedocSynopsis(astEnum);

    this._indentedWriter.writeLine(`enum ${astEnum.name} {`);

    this._indentedWriter.indentScope(() => {
      const members: AstItem[] = astEnum.getSortedMemberItems();
      for (let i: number = 0; i < members.length; ++i) {
        this.visit(members[i]);
        this._indentedWriter.writeLine(i < members.length - 1 ? ',' : '');
      }
    });

    this._indentedWriter.write('}');
  }

  protected visitAstEnumValue(astEnumValue: AstEnumValue): void {
    this._writeAedocSynopsis(astEnumValue);

    this._indentedWriter.write(astEnumValue.getDeclarationLine());
  }

  protected visitAstPackage(astPackage: AstPackage): void {
    for (const astItem of astPackage.getSortedMemberItems()) {
      this.visit(astItem);
      this._indentedWriter.writeLine();
      this._indentedWriter.writeLine();
    }

    this._writeAedocSynopsis(astPackage);
  }

  protected visitAstNamespace(astNamespace: AstNamespace): void {
    this._writeAedocSynopsis(astNamespace);

    // We have decided to call the astNamespace a 'module' in our
    // public API documentation.
    this._indentedWriter.writeLine(`module ${astNamespace.name} {`);

    this._indentedWriter.indentScope(() => {
      for (const astItem of astNamespace.getSortedMemberItems()) {
        this.visit(astItem);
        this._indentedWriter.writeLine();
        this._indentedWriter.writeLine();
      }
    });

    this._indentedWriter.write('}');
  }

  protected visitAstModuleVariable(astModuleVariable: AstModuleVariable): void {
    this._writeAedocSynopsis(astModuleVariable);

    if (astModuleVariable.value) {
      this._indentedWriter.write(`${astModuleVariable.name}: ${astModuleVariable.type} = ${astModuleVariable.value};`);
    } else {
      this._indentedWriter.write(`${astModuleVariable.name}: ${astModuleVariable.type};`);
    }
  }

  protected visitAstMember(astMember: AstMember): void {
    if (astMember.documentation) {
      this._writeAedocSynopsis(astMember);
    }

    this._indentedWriter.write(astMember.getDeclarationLine());

    if (astMember.typeLiteral) {
      this._insideTypeLiteral += 1;
      this.visit(astMember.typeLiteral);
      this._insideTypeLiteral -= 1;
    }
  }

  protected visitAstFunction(astFunction: AstFunction): void {
    this._writeAedocSynopsis(astFunction);
    this._indentedWriter.write(astFunction.getDeclarationLine());
  }

  /**
   * Writes a synopsis of the AEDoc comments, which indicates the release tag,
   * whether the item has been documented, and any warnings that were detected
   * by the analysis.
   */
  private _writeAedocSynopsis(astItem: AstItem): void {
    this._writeWarnings(astItem);
    const lines: string[] = [];

    if (astItem instanceof AstPackage && !astItem.documentation.summary.length) {
      lines.push('(No @packagedocumentation comment for this package)');
    } else {
      const footerParts: string[] = [];
      switch (astItem.documentation.releaseTag) {
        case ReleaseTag.Internal:
          footerParts.push('@internal');
          break;
        case ReleaseTag.Alpha:
          footerParts.push('@alpha');
          break;
        case ReleaseTag.Beta:
          footerParts.push('@beta');
          break;
        case ReleaseTag.Public:
          footerParts.push('@public');
          break;
      }

      if (astItem.documentation.isSealed) {
        footerParts.push('@sealed');
      }

      if (astItem.documentation.isVirtual) {
        footerParts.push('@virtual');
      }

      if (astItem.documentation.isOverride) {
        footerParts.push('@override');
      }

      if (astItem.documentation.isEventProperty) {
        footerParts.push('@eventproperty');
      }

      // deprecatedMessage is initialized by default,
      // this ensures it has contents before adding '@deprecated'
      if (astItem.documentation.deprecatedMessage.length > 0) {
        footerParts.push('@deprecated');
      }

      // If we are anywhere inside a TypeLiteral, _insideTypeLiteral is greater than 0
      if (this._insideTypeLiteral === 0 && astItem.needsDocumentation) {
        footerParts.push('(undocumented)');
      }

      if (footerParts.length > 0) {
        lines.push(footerParts.join(' '));
      }
    }

    this._writeLinesAsComments(lines);
  }

  private _writeWarnings(astItem: AstItem): void {
    const lines: string[] = astItem.warnings.map((x: string) => 'WARNING: ' + x);
    this._writeLinesAsComments(lines);
  }

  private _writeLinesAsComments(lines: string[]): void {
    if (lines.length) {
      // Write the lines prefixed by slashes.  If there  are multiple lines, add "//" to each line
      this._indentedWriter.write('// ');
      this._indentedWriter.write(lines.join('\n// '));
      this._indentedWriter.writeLine();
    }
  }
}
