import ApiFileGenerator from './ApiFileGenerator';
import ApiItem from '../definitions/ApiItem';
import ApiMember from '../definitions/ApiMember';
import ApiPackage from '../definitions/ApiPackage';
import ApiParameter from '../definitions/ApiParameter';
import ApiProperty from '../definitions/ApiProperty';
import ApiStructuredType, { ApiStructuredTypeKind } from '../definitions/ApiStructuredType';
import { ApiTag } from '../definitions/ApiDocumentation';

export default class TypeDocGenerator extends ApiFileGenerator {
  protected visit(apiItem: ApiItem): void {
    if ((apiItem.documentation.apiTag === ApiTag.None ||
      apiItem.documentation.apiTag === ApiTag.Beta ||
      apiItem.documentation.apiTag === ApiTag.Public)) {
      super.visit(apiItem);
    }
  }

  protected visitApiStructuredType(apiStructuredType: ApiStructuredType): void {
    if (apiStructuredType.kind !== ApiStructuredTypeKind.TypeLiteral) {
      this.writeJsdocSynopsis(apiStructuredType);
    }

    if (apiStructuredType.kind === ApiStructuredTypeKind.Class) {
      this._indentedWriter.write('declare ');
    }

    const declarationLine: string = apiStructuredType.getDeclarationLine();
    this._indentedWriter.writeLine(declarationLine + ' {');

    this._indentedWriter.indentScope(() => {
      for (const member of apiStructuredType.getSortedMemberItems()) {
        this.visit(member);
        this._indentedWriter.writeLine();
      }
    });

    this._indentedWriter.write('}');
  }

  protected visitApiPackage(apiPackage: ApiPackage): void {
    this._indentedWriter.write('/// <reference path="../typings/tsd.d.ts" />');
    this._indentedWriter.writeLine();
    this._indentedWriter.writeLine();

    if (apiPackage.documentation.apiTag !== ApiTag.Internal) {
      for (const apiItem of apiPackage.getSortedMemberItems()) {
        if (apiItem.documentation.apiTag !== ApiTag.Internal) {
          this.visit(apiItem);
          this._indentedWriter.writeLine();
          this._indentedWriter.writeLine();
        }
      }
    }
  }

  protected visitApiMember(apiMember: ApiMember): void {
    // Properties normally have getters/setters like this:
    //
    //   /** doc #1 */
    //   protected get displayMode(): number { ... }
    //   /** doc #2 */
    //   protected set displayMode(o: number) { ... }
    //
    // However, since we are converting to "declare" style class, we ignore
    // setter and write a single definition like this:
    //
    //   /** doc #1 */
    //   protected displayMode: number;

    this.writeJsdocSynopsis(apiMember);

    const declarationLine: string = apiMember instanceof ApiProperty ?
      (apiMember as ApiProperty).getDeclarationLine() :
      apiMember.getDeclarationLine();

    this._indentedWriter.write(declarationLine);

    if (apiMember.typeLiteral) {
      this.visit(apiMember.typeLiteral);
    }
  }

  protected visitApiParam(apiParam: ApiParameter): void {
    throw Error('Not Implemented');
  }

  protected writeJsdocSynopsis(apiItem: ApiItem): void {
    if (apiItem.documentation.docComment.trim() !== '') {
      // Now we are going to do a series of rewrites of the tokens, and then
      // rejoin them to make the final documentation.

      const tokens: string[] = apiItem.documentation.docCommentTokens.slice(0); // clone array

      // 1. Replace something like this:
      //
      //    /*
      //     * hello
      //     * @internalremarks This is some text
      //     * that is for internal eyes only
      //     * @public
      //     */
      //
      // ...with this:
      //
      //    /*
      //     * hello
      //     * @public
      //     */
      const internalRemarksIndex: number = tokens.indexOf('@internalremarks');
      if (internalRemarksIndex >= 0) {

        let stopIndex: number = internalRemarksIndex + 1;
        while (stopIndex < tokens.length && tokens[stopIndex].charAt(0) !== '@') {
          ++stopIndex;
        }

        // Remove the @internalremarks token and everything up to (but not including) stopIndex
        tokens.splice(internalRemarksIndex, stopIndex - internalRemarksIndex);
      }

      const content: string = tokens.join('');

      this._indentedWriter.write('/**\n * ');
      this._indentedWriter.write(content.replace(/\n/g, '\n * '));
      this._indentedWriter.write('\n */\n');
    }
  }
}
