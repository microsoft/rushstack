// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  MarkupLinkTextElement,
  MarkupBasicElement,
  MarkupElement
} from '../markup/MarkupElement';
import { Markup } from '../markup/Markup';
import { ApiDefinitionReference, IScopedPackageName } from '../ApiDefinitionReference';
import { ApiDocumentation } from '../aedoc/ApiDocumentation';
import { AstItemKind } from '../ast/AstItem';
import { Token, TokenType } from '../aedoc/Token';
import { Tokenizer } from '../aedoc/Tokenizer';
import { ResolvedApiItem } from '../ResolvedApiItem';
import { IApiItemReference} from '../api/ApiItem';

export class DocElementParser {
  /**
   * Used to validate the display text for an \@link tag.  The display text can contain any
   * characters except for certain AEDoc delimiters: "@", "|", "{", "}".
   * This RegExp matches the first bad character.
   * Example: "Microsoft's {spec}" --> "{"
   */
  private static _displayTextBadCharacterRegEx: RegExp = /[@|{}]/;

  /**
   * Matches a href reference. This is used to get an idea whether a given reference is for an href
   * or an API definition reference.
   *
   * For example, the following would be matched:
   * 'http://'
   * 'https://'
   *
   * The following would not be matched:
   * '@microsoft/sp-core-library:Guid.newGuid'
   * 'Guid.newGuid'
   * 'Guid'
   */
  private static _hrefRegEx: RegExp = /^[a-z]+:\/\//;

  public static parse(documentation: ApiDocumentation, tokenizer: Tokenizer): MarkupBasicElement[] {

    const markupElements: MarkupBasicElement[] = [];
    let parsing: boolean = true;
    let token: Token | undefined;

    while (parsing) {
      token = tokenizer.peekToken();
      if (!token) {
        parsing = false; // end of stream
        break;
      }

      if (token.type === TokenType.BlockTag) {
        parsing = false; // end of summary tokens
      } else if (token.type === TokenType.InlineTag) {
        switch (token.tag) {
          case '@inheritdoc':
            tokenizer.getToken();
            if (markupElements.length > 0 ||  documentation.summary.length > 0) {
              documentation.reportError('A summary block is not allowed here,'
                + ' because the @inheritdoc target provides the summary');
            }
            documentation.incompleteInheritdocs.push(token);
            documentation.isDocInherited = true;
            break;
          case '@link' :
            const linkMarkupElement: MarkupElement | undefined = this.parseLinkTag(documentation, token);
            if (linkMarkupElement) {
              // Push to linkMarkupElement to retain position in the documentation
              markupElements.push(linkMarkupElement);
              if (linkMarkupElement.kind === 'api-link') {
                documentation.incompleteLinks.push(linkMarkupElement);
              }
            }
            tokenizer.getToken(); // get the link token
            break;
          default:
            parsing = false;
            break;
        }
      } else if (token.type === TokenType.Text) {
        tokenizer.getToken();

        markupElements.push(...Markup.createTextParagraphs(token.text));
      } else {
        documentation.reportError(`Unidentifiable Token ${token.type} ${token.tag} "${token.text}"`);
      }
    }

    return markupElements;
  }

  public static parseAndNormalize(documentation: ApiDocumentation, tokenizer: Tokenizer): MarkupBasicElement[] {
    const markupElements: MarkupBasicElement[] = DocElementParser.parse(documentation, tokenizer);
    Markup.normalize(markupElements);
    return markupElements;
  }

  /**
   * This method parses the semantic information in an \@link JSDoc tag, creates and returns a
   * MarkupElement with the corresponding information. If the corresponding inline tag \@link is
   * not formatted correctly an error will be reported and undefined is returned.
   *
   * The format for the \@link tag is {\@link URL or API defintion reference | display text}, where
   * the '|' is only needed if the optional display text is given.
   *
   * Examples:
   * \{@link http://microsoft.com | microsoft home \}
   * \{@link http://microsoft.com \}
   * \{@link @microsoft/sp-core-library:Guid.newGuid | new Guid Object \}
   * \{@link @microsoft/sp-core-library:Guid.newGuid \}
   */
  public static parseLinkTag(documentation: ApiDocumentation, tokenItem: Token): MarkupBasicElement | undefined {
    if (!tokenItem.text) {
      documentation.reportError('The {@link} tag must include a URL or API item reference');
      return undefined;
    }

    // Make sure there are no extra pipes
    const pipeSplitContent: string[] = tokenItem.text.split('|').map(value => {
      return value ? value.trim() : value;
    });

    if (pipeSplitContent.length > 2) {
      documentation.reportError('The {@link} tag contains more than one pipe character ("|")');
      return undefined;
    }

    const addressPart: string = pipeSplitContent[0];
    const displayTextPart: string = pipeSplitContent.length > 1 ? pipeSplitContent[1] : '';

    let displayTextElements: MarkupLinkTextElement[];

    // If a display name is given, ensure it only contains characters for words.
    if (displayTextPart) {
      const match: RegExpExecArray | null = this._displayTextBadCharacterRegEx.exec(displayTextPart);
      if (match) {
        documentation.reportError(`The {@link} tag\'s display text contains an unsupported`
          + ` character: "${match[0]}"`);
        return undefined;
      }
      // Full match is valid text
      displayTextElements = Markup.createTextElements(displayTextPart);
    } else {
      // If the display text is not explicitly provided, then use the address as the display text
      displayTextElements = Markup.createTextElements(addressPart);
    }

    // Try to guess if the tokenContent is a link or API definition reference
    let linkMarkupElement: MarkupBasicElement;
    if (this._hrefRegEx.test(addressPart)) {
      // Make sure only a single URL is given
      if (addressPart.indexOf(' ') >= 0) {
        documentation.reportError('The {@link} tag contains additional spaces after the URL;'
          + ' if the URL contains spaces, encode them using %20; for display text, use a pipe delimiter ("|")');
        return undefined;
      }

      linkMarkupElement = Markup.createWebLink(displayTextElements, addressPart);
    } else {
      // we are processing an API definition reference
      const apiDefitionRef: ApiDefinitionReference | undefined = ApiDefinitionReference.createFromString(
        addressPart,
        documentation.reportError
      );

      // Once we can locate local API definitions, an error should be reported here if not found.
      if (!apiDefitionRef) {
        return undefined;
      }

      const normalizedApiLink: IApiItemReference = apiDefitionRef.toApiItemReference();
      if (!normalizedApiLink.packageName) {
        if (!documentation.context.packageName) {
          throw new Error('Unable to resolve API reference without a package name');
        }

        // If the package name is unspecified, assume it is the current package
        const scopePackageName: IScopedPackageName = ApiDefinitionReference.parseScopedPackageName(
          documentation.context.packageName);

        normalizedApiLink.scopeName = scopePackageName.scope;
        normalizedApiLink.packageName = scopePackageName.package;
      }

      linkMarkupElement = Markup.createApiLink(displayTextElements, normalizedApiLink);
    }

    return linkMarkupElement;
  }

  /**
   * This method parses the semantic information in an \@inheritdoc JSDoc tag and sets
   * all the relevant documenation properties from the inherited doc onto the documenation
   * of the current api item.
   *
   * The format for the \@inheritdoc tag is {\@inheritdoc scopeName/packageName:exportName.memberName}.
   * For more information on the format see IInheritdocRef.
   */
  public static parseInheritDoc(documentation: ApiDocumentation, token: Token, warnings: string[]): void {

    // Check to make sure the API definition reference is at most one string
    const tokenChunks: string[] = token.text.split(' ');
    if (tokenChunks.length > 1) {
      documentation.reportError('The {@inheritdoc} tag does not match the expected pattern' +
        ' "{@inheritdoc @scopeName/packageName:exportName}"');
      return;
    }

    // Create the IApiDefinitionReference object
    // Deconstruct the API reference expression 'scopeName/packageName:exportName.memberName'
    const apiDefinitionRef: ApiDefinitionReference | undefined = ApiDefinitionReference.createFromString(
      token.text,
      documentation.reportError
    );
    // if API reference expression is formatted incorrectly then apiDefinitionRef will be undefined
    if (!apiDefinitionRef) {
      documentation.reportError(`Incorrectly formatted API item reference: "${token.text}"`);
      return;
    }

    // Atempt to locate the apiDefinitionRef
    const resolvedAstItem: ResolvedApiItem | undefined = documentation.referenceResolver.resolve(
      apiDefinitionRef,
      documentation.context.package,
      warnings
    );

    // If no resolvedAstItem found then nothing to inherit
    // But for the time being set the summary to a text object
    if (!resolvedAstItem) {
      documentation.summary = Markup.createTextElements(`See documentation for ${tokenChunks[0]}`);
      return;
    }

    // We are going to copy the resolvedAstItem's documentation
    // We must make sure it's documentation can be completed,
    // if we cannot, an error will be reported viathe documentation error handler.
    // This will only be the case our resolvedAstItem was created from a local
    // AstItem. Resolutions from JSON will have an undefined 'astItem' property.
    // Example: a circular reference will report an error.
    if (resolvedAstItem.astItem) {
      resolvedAstItem.astItem.completeInitialization();
    }

    // inheritdoc found, copy over IApiBaseDefinition properties
    documentation.summary =  resolvedAstItem.summary;
    documentation.remarks = resolvedAstItem.remarks;

    // Copy over detailed properties if neccessary
    // Add additional cases if needed
    switch (resolvedAstItem.kind) {
      case AstItemKind.Function:
        documentation.parameters = resolvedAstItem.params || { };
        documentation.returnsMessage = resolvedAstItem.returnsMessage || [];
        break;
      case AstItemKind.Method:
      case AstItemKind.Constructor:
        documentation.parameters = resolvedAstItem.params || { };
        documentation.returnsMessage = resolvedAstItem.returnsMessage || [];
        break;
    }

    // Check if inheritdoc is depreacted
    // We need to check if this documentation has a deprecated message
    // but it may not appear until after this token.
    if (resolvedAstItem.deprecatedMessage && resolvedAstItem.deprecatedMessage.length > 0) {
      documentation.isDocInheritedDeprecated = true;
    }
  }
}