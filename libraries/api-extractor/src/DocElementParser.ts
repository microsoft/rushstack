// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ITextElement,
  IDocElement,
  IHrefLinkElement,
  ICodeLinkElement,
  ISeeDocElement
} from './markup/OldMarkup';
import ApiDefinitionReference, { IScopedPackageName } from './ApiDefinitionReference';
import ApiDocumentation from './aedoc/ApiDocumentation';
import { AstItemKind } from './ast/AstItem';
import Token, { TokenType } from './aedoc/Token';
import Tokenizer from './aedoc/Tokenizer';
import ResolvedApiItem from './ResolvedApiItem';

export default class DocElementParser {
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

  public static getAsText(collection: IDocElement[], reportError: (message: string) => void): string {
    let text: string = '';

    collection.forEach(docElement => {
      switch (docElement.kind) {
        case 'textDocElement':
          text += `${(docElement as ITextElement).value} `;
          break;
        case 'linkDocElement':
          // links don't count towards the summary
          break;
        case 'seeDocElement':
          // see doesn't count towards the summary
          break;
        default:
          reportError('Unexpected item in IDocElement collection');
          break;
      }
    });

    return text.trim();
  }

  public static makeTextElement(text: string): IDocElement {
    if (!text) {
      return;
    }
    return {kind: 'textDocElement', value: text} as ITextElement;
  }

  public static parse(documentation: ApiDocumentation, tokenizer: Tokenizer): IDocElement[] {
    const docElements: IDocElement[] = [];
    let parsing: boolean = true;
    let token: Token;

    while (parsing) {
      token = tokenizer.peekToken();
      if (!token) {
        parsing = false; // end of stream
        break;
      }

      if (token.type === TokenType.BlockTag) {
        switch (token.tag) {
          case '@see':
            tokenizer.getToken();
            docElements.push({
              kind: 'seeDocElement',
              seeElements: this.parse(documentation, tokenizer)
            } as ISeeDocElement);
            break;
          default:
            parsing = false; // end of summary tokens
            break;
        }
      } else if (token.type === TokenType.InlineTag) {
        switch (token.tag) {
          case '@inheritdoc':
            tokenizer.getToken();
            if (docElements.length > 0 ||  documentation.summary.length > 0) {
              documentation.reportError('A summary block is not allowed here,'
                + ' because the @inheritdoc target provides the summary');
            }
            documentation.incompleteInheritdocs.push(token);
            documentation.isDocInherited = true;
            break;
          case '@link' :
            const linkDocElement: ICodeLinkElement | IHrefLinkElement = this.parseLinkTag(documentation, token);
            if (linkDocElement) {
              // Push to docElements to retain position in the documentation
              docElements.push(linkDocElement);
              if (linkDocElement.referenceType === 'code') {
                documentation.incompleteLinks.push(linkDocElement);
              }
            }
            tokenizer.getToken(); // get the link token
            break;
          default:
            parsing = false;
            break;
        }
      } else if (token.type === TokenType.Text) {
        docElements.push({kind: 'textDocElement', value: token.text} as ITextElement);
          tokenizer.getToken();
      } else {
        documentation.reportError(`Unidentifiable Token ${token.type} ${token.tag} "${token.text}"`);
      }
    }
    return docElements;
  }

  /**
   * This method parses the semantic information in an \@link JSDoc tag, creates and returns a
   * linkDocElement with the corresponding information. If the corresponding inline tag \@link is
   * not formatted correctly an error will be reported.
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
  public static parseLinkTag(documentation: ApiDocumentation, tokenItem: Token): IHrefLinkElement | ICodeLinkElement {
    if (!tokenItem.text) {
      documentation.reportError('The {@link} tag must include a URL or API item reference');
       return;
    }

    // Make sure there are no extra pipes
    const pipeSplitContent: string[] = tokenItem.text.split('|').map(value => {
      if (value) {
        return value.trim();
      }
    });
    if (pipeSplitContent.length > 2) {
      documentation.reportError('The {@link} tag contains more than one pipe character ("|")');
      return undefined;
    }

    const addressPart: string = pipeSplitContent[0];
    const displayTextPart: string = pipeSplitContent.length > 1 ? pipeSplitContent[1] : '';

    // Try to guess if the tokenContent is a link or API definition reference
    let linkDocElement: ICodeLinkElement | IHrefLinkElement;
    if (this._hrefRegEx.test(addressPart)) {
      // Make sure only a single URL is given
      if (addressPart.indexOf(' ') >= 0) {
        documentation.reportError('The {@link} tag contains additional spaces after the URL;'
          + ' if the URL contains spaces, encode them using %20; for display text, use a pipe delimiter ("|")');
        return undefined;
      }

      linkDocElement = {
        kind: 'linkDocElement',
        referenceType: 'href',
        targetUrl: addressPart
        // ("value" will be assigned below)
      };

    } else {
      // we are processing an API definition reference
      const apiDefitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromString(
        addressPart,
        documentation.reportError
      );

      // Once we can locate local API definitions, an error should be reported here if not found.
      if (!apiDefitionRef) {
        return undefined;
      }

      linkDocElement = {
        kind: 'linkDocElement',
        referenceType: 'code',
        scopeName: apiDefitionRef.scopeName,
        packageName: apiDefitionRef.packageName,
        exportName: apiDefitionRef.exportName,
        memberName: apiDefitionRef.memberName
        // ("value" will be assigned below)
      };

      if (!linkDocElement.packageName) {
        if (!documentation.extractor.packageName) {
          throw new Error('Unable to resolve API reference without a package name');
        }

        // If the package name is unspecified, assume it is the current package
        const scopePackageName: IScopedPackageName = ApiDefinitionReference.parseScopedPackageName(
          documentation.extractor.packageName);

        linkDocElement.scopeName = scopePackageName.scope;
        linkDocElement.packageName = scopePackageName.package;
      }

    }

    // If a display name is given, ensure it only contains characters for words.
    if (displayTextPart) {
      const match: RegExpExecArray | undefined = this._displayTextBadCharacterRegEx.exec(displayTextPart);
      if (match) {
        documentation.reportError(`The {@link} tag\'s display text contains an unsupported`
          + ` character: "${match[0]}"`);
        return undefined;
      }
      // Full match is valid text
      linkDocElement.value = displayTextPart;
    } else {
      // If the display text is not explicitly provided, then use the address as the display text
      linkDocElement.value = addressPart;
    }

    return linkDocElement;
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
    const apiDefinitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromString(
      token.text,
      documentation.reportError
    );
    // if API reference expression is formatted incorrectly then apiDefinitionRef will be undefined
    if (!apiDefinitionRef) {
      documentation.reportError(`Incorrectly formatted API item reference: "${token.text}"`);
      return;
    }

    // Atempt to locate the apiDefinitionRef
    const resolvedAstItem: ResolvedApiItem = documentation.referenceResolver.resolve(
      apiDefinitionRef,
      documentation.extractor.package,
      warnings
    );

    // If no resolvedAstItem found then nothing to inherit
    // But for the time being set the summary to a text object
    if (!resolvedAstItem) {
      const textDocItem: IDocElement = {
        kind: 'textDocElement',
        value: `See documentation for ${tokenChunks[0]}`
      } as ITextElement;
      documentation.summary = [textDocItem];
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
        documentation.parameters = resolvedAstItem.params;
        documentation.returnsMessage = resolvedAstItem.returnsMessage;
        break;
      case AstItemKind.Method:
        documentation.parameters = resolvedAstItem.params;
        documentation.returnsMessage = resolvedAstItem.returnsMessage;
        break;
    }

    // Check if inheritdoc is depreacted
    // We need to check if this documentation has a deprecated message
    // but it may not appear until after this token.
    if (resolvedAstItem.deprecatedMessage.length > 0) {
      documentation.isDocInheritedDeprecated = true;
    }
  }
}