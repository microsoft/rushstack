// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import Extractor from '../Extractor';
import ApiStructuredType from '../definitions/ApiStructuredType';
import ApiEnum from '../definitions/ApiEnum';
import ApiEnumValue from '../definitions/ApiEnumValue';
import ApiFunction from '../definitions/ApiFunction';
import ApiItem, { ApiItemKind } from '../definitions/ApiItem';
import ApiItemVisitor from '../ApiItemVisitor';
import ApiPackage from '../definitions/ApiPackage';
import ApiParameter from '../definitions/ApiParameter';
import ApiMember from '../definitions/ApiMember';
import ApiNamespace from '../definitions/ApiNamespace';
import ApiModuleVariable from '../definitions/ApiModuleVariable';
import IndentedWriter from '../IndentedWriter';
import { ReleaseTag } from '../definitions/ApiDocumentation';

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
export default class ApiFileGenerator extends ApiItemVisitor {
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
  public writeApiFile(reportFilename: string, extractor: Extractor): void {
    const fileContent: string = this.generateApiFileContent(extractor);
    fs.writeFileSync(reportFilename, fileContent);
  }

  public generateApiFileContent(extractor: Extractor): string {
    this._insideTypeLiteral = 0;
    // Normalize to CRLF
    this.visit(extractor.package);
    const fileContent: string = this._indentedWriter.toString().replace(/\r?\n/g, '\r\n');
    return fileContent;
  }

  protected visitApiStructuredType(apiStructuredType: ApiStructuredType): void {
    const declarationLine: string = apiStructuredType.getDeclarationLine();

    if (apiStructuredType.documentation.preapproved) {
      this._indentedWriter.writeLine('// @internal (preapproved)');
      this._indentedWriter.writeLine(declarationLine + ' {');
      this._indentedWriter.writeLine('}');
      return;
    }

    if (apiStructuredType.kind !== ApiItemKind.TypeLiteral) {
      this._writeAedocSynopsis(apiStructuredType);
    }

    this._indentedWriter.writeLine(declarationLine + ' {');

    this._indentedWriter.indentScope(() => {
      if (apiStructuredType.kind === ApiItemKind.TypeLiteral) {
        // Type literals don't have normal JSDoc.  Write only the warnings,
        // and put them after the '{' since the declaration is nested.
        this._writeWarnings(apiStructuredType);
      }

      for (const member of apiStructuredType.getSortedMemberItems()) {
        this.visit(member);
        this._indentedWriter.writeLine();
      }
    });

    this._indentedWriter.write('}');
  }

  protected visitApiEnum(apiEnum: ApiEnum): void {
    this._writeAedocSynopsis(apiEnum);

    this._indentedWriter.writeLine(`enum ${apiEnum.name} {`);

    this._indentedWriter.indentScope(() => {
      const members: ApiItem[] = apiEnum.getSortedMemberItems();
      for (let i: number = 0; i < members.length; ++i) {
        this.visit(members[i]);
        this._indentedWriter.writeLine(i < members.length - 1 ? ',' : '');
      }
    });

    this._indentedWriter.write('}');
  }

  protected visitApiEnumValue(apiEnumValue: ApiEnumValue): void {
    this._writeAedocSynopsis(apiEnumValue);

    this._indentedWriter.write(apiEnumValue.getDeclarationLine());
  }

  protected visitApiPackage(apiPackage: ApiPackage): void {
    for (const apiItem of apiPackage.getSortedMemberItems()) {
      this.visit(apiItem);
      this._indentedWriter.writeLine();
      this._indentedWriter.writeLine();
    }

    this._writeAedocSynopsis(apiPackage);
  }

  protected visitApiNamespace(apiNamespace: ApiNamespace): void {
    this._writeAedocSynopsis(apiNamespace);

    // We have decided to call the apiNamespace a 'module' in our
    // public API documentation.
    this._indentedWriter.writeLine(`module ${apiNamespace.name} {`);

    this._indentedWriter.indentScope(() => {
      for (const apiItem of apiNamespace.getSortedMemberItems()) {
        this.visit(apiItem);
        this._indentedWriter.writeLine();
        this._indentedWriter.writeLine();
      }
    });

    this._indentedWriter.write('}');
  }

  protected visitApiModuleVariable(apiModuleVariable: ApiModuleVariable): void {
    this._writeAedocSynopsis(apiModuleVariable);

    this._indentedWriter.write(`${apiModuleVariable.name}: ${apiModuleVariable.type} = ${apiModuleVariable.value};`);
  }

  protected visitApiMember(apiMember: ApiMember): void {
    if (apiMember.documentation) {
      this._writeAedocSynopsis(apiMember);
    }

    this._indentedWriter.write(apiMember.getDeclarationLine());

    if (apiMember.typeLiteral) {
      this._insideTypeLiteral += 1;
      this.visit(apiMember.typeLiteral);
      this._insideTypeLiteral -= 1;
    }
  }

  protected visitApiFunction(apiFunction: ApiFunction): void {
    this._writeAedocSynopsis(apiFunction);
    this._indentedWriter.write(apiFunction.getDeclarationLine());
  }

  protected visitApiParam(apiParam: ApiParameter): void {
    throw Error('Not Implemented');
  }

  /**
   * Writes a synopsis of the AEDoc comments, which indicates the release tag,
   * whether the item has been documented, and any warnings that were detected
   * by the analysis.
   */
  private _writeAedocSynopsis(apiItem: ApiItem): void {
    this._writeWarnings(apiItem);
    const lines: string[] = [];

    if (apiItem instanceof ApiPackage && !apiItem.documentation.summary.length) {
      lines.push('(No packageDescription for this package)');
    } else {
      let footer: string = '';
      switch (apiItem.documentation.releaseTag) {
        case ReleaseTag.Internal:
          footer += '@internal';
          break;
        case ReleaseTag.Alpha:
          footer += '@alpha';
          break;
        case ReleaseTag.Beta:
          footer += '@beta';
          break;
        case ReleaseTag.Public:
          footer += '@public';
          break;
      }

      // deprecatedMessage is initialized by default,
      // this ensures it has contents before adding '@deprecated'
      if (apiItem.documentation.deprecatedMessage.length > 0) {
        if (footer) {
          footer += ' ';
        }
        footer += '@deprecated';
      }

      // If we are anywhere inside a TypeLiteral, _insideTypeLiteral is greater than 0
      if (this._insideTypeLiteral === 0 && apiItem.needsDocumentation) {
        if (footer) {
          footer += ' ';
        }
        footer += '(undocumented)';
      }

      if (footer) {
        lines.push(footer);
      }
    }

    this._writeLinesAsComments(lines);
  }

  private _writeWarnings(apiItem: ApiItem): void {
    const lines: string[] = apiItem.warnings.map((x: string) => 'WARNING: ' + x);
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
