import { ITextElement, IDocElement, IHrefLinkElement, ICodeLinkElement, ISeeDocElement } from './IDocElement';
import ApiDefinitionReference from './ApiDefinitionReference';
import ApiDocumentation from './definitions/ApiDocumentation';
import { ApiItemKind } from './definitions/ApiItem';
import Token, { TokenType } from './Token';
import Tokenizer from './Tokenizer';
import ResolvedApiItem from './ResolvedApiItem';

export default class DocElementParser {

  /**
   * Matches only strings that contain characters for words.
   * Any non word characters or spaces, will be present in the third entry in the match results
   * if they exist.
   */
  private static _wordRegEx: RegExp = /^([\w\s]*)/;

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

      if (token.type === TokenType.Tag) {
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
      } else if (token.type === TokenType.Inline) {
        switch (token.tag) {
          case '@inheritdoc':
            tokenizer.getToken();
            if (docElements.length > 0 ||  documentation.summary.length > 0) {
              documentation.reportError('Cannot provide summary in JsDoc if @inheritdoc tag is given');
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
        documentation.reportError(`Unidentifiable Token ${token.type} ${token.tag} ${token.text}`);
      }
    }
    return docElements;
  }

  /**
   * This method parses the semantic information in an \@link JSDoc tag, creates and returns a
   * linkDocElement with the corresponding information. If the corresponding inline tag \@link is
   * not formatted correctly an error will be reported.
   *
   * The format for the \@link tag is {\@link url or API defintion reference | display text}, where
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
      documentation.reportError('Invalid @link inline token, a url or API definition reference must be given');
       return;
    }

    // Make sure there are no extra pipes
    let pipeSplitContent: string[] = tokenItem.text.split('|');
    pipeSplitContent = pipeSplitContent.map( value => {
      if (value) {
        return value.trim();
      }
    });
    if (pipeSplitContent.length > 2) {
      documentation.reportError('Invalid @link parameters, at most one pipe character allowed.');
      return;
    }

    // Try to guess if the tokenContent is a link or API definition reference
    let linkDocElement: ICodeLinkElement | IHrefLinkElement;
    if (tokenItem.text.match(this._hrefRegEx)) {
      const urlContent: string[] = pipeSplitContent[0].split(' ');

      // Make sure only a single url is given
      if (urlContent.length > 1 && urlContent[1] !== '' ) {
        documentation.reportError('Invalid @link parameter, url must be a single string.');
        return;
      }

      linkDocElement = {
        kind: 'linkDocElement',
        referenceType: 'href',
        targetUrl: urlContent[0],
        value: ''
      };

    } else {
      // we are processing an API definition reference
      const apiDefitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromString(
        pipeSplitContent[0],
        documentation.reportError
      );

      // Once we can locate local API definitions, an error should be reported here if not found.
      if (apiDefitionRef) {

        linkDocElement = {
          kind: 'linkDocElement',
          referenceType: 'code',
          scopeName: apiDefitionRef.scopeName,
          packageName: apiDefitionRef.packageName,
          exportName: apiDefitionRef.exportName,
          memberName: apiDefitionRef.memberName
        };
      }
    }

    // If a display name is given, ensure it only contains characters for words.
    if (linkDocElement && pipeSplitContent.length > 1) {
      const displayTextParts: string[] = pipeSplitContent[1].match(this._wordRegEx);
      if (displayTextParts && displayTextParts[0].length !== pipeSplitContent[1].length) {
        documentation.reportError('Display name in @link token may only contain alphabetic characters.');
        return;
      }
      // Full match is valid text
      linkDocElement.value = displayTextParts[0].trim();
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
  public static parseInheritDoc(documentation: ApiDocumentation, token: Token): void {

    // Check to make sure the API definition reference is at most one string
    const tokenChunks: string[] = token.text.split(' ');
    if (tokenChunks.length > 1) {
      documentation.reportError('Too many parameters for @inheritdoc inline tag.' +
        'The format should be {@inheritdoc scopeName/packageName:exportName}. Extra parameters are ignored');
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
      documentation.reportError('Incorrecty formatted API definition reference');
      return;
    }

    // Atempt to locate the apiDefinitionRef
    const resolvedApiItem: ResolvedApiItem = documentation.referenceResolver.resolve(
      apiDefinitionRef,
      documentation.extractor.package,
      documentation.reportError
    );

    // If no resolvedApiItem found then nothing to inherit
    // But for the time being set the summary to a text object
    if (!resolvedApiItem) {
      const textDocItem: IDocElement = {
        kind: 'textDocElement',
        value: `See documentation for ${tokenChunks[0]}`
      } as ITextElement;
      documentation.summary = [textDocItem];
      return;
    }

    // We are going to copy the resolvedApiItem's documentation 
    // We must make sure it's documentation can be completed,
    // if we cannot, an error will be reported viathe documentation error handler. 
    // This will only be the case our resolvedApiItem was created from a local 
    // ApiItem. Resolutions from JSON will have an undefined 'apiItem' property.
    // Example: a circular reference will report an error. 
    if (resolvedApiItem.apiItem) {
      resolvedApiItem.apiItem.completeInitialization();
    }

    // inheritdoc found, copy over IDocBase properties
    documentation.summary =  resolvedApiItem.summary;
    documentation.remarks = resolvedApiItem.remarks;

    // Copy over detailed properties if neccessary
    // Add additional cases if needed
    switch (resolvedApiItem.kind) {
      case ApiItemKind.Function:
        documentation.parameters = resolvedApiItem.params;
        documentation.returnsMessage = resolvedApiItem.returnsMessage;
        break;
      case ApiItemKind.Method:
        documentation.parameters = resolvedApiItem.params;
        documentation.returnsMessage = resolvedApiItem.returnsMessage;
        break;
    }

    // Check if inheritdoc is depreacted
    // We need to check if this documentation has a deprecated message
    // but it may not appear until after this token.
    if (resolvedApiItem.deprecatedMessage) {
      documentation.isDocInheritedDeprecated = true;
    }
  }
}