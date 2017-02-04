import { ITextElement, IDocElement, IHrefLinkElement, ICodeLinkElement, ISeeDocElement } from './IDocElement';
import { IApiDefinitionReference } from './IApiDefinitionReference';
import ApiDocumentation from './definitions/ApiDocumentation';
import Token, { TokenType } from './Token';
import Tokenizer from './Tokenizer';

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
          reportError('Unexpected item in JsDoc collection');
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

  public static parse(tokenizer: Tokenizer, reportError: (message: string) => void): IDocElement[] {
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
              seeElements: this.parse(tokenizer, reportError)
            } as ISeeDocElement);
            break;
          default:
            parsing = false; // end of summary tokens
            break;
        }
      } else if (token.type === TokenType.Inline) {
        switch (token.tag) {
          case '@link' :
            const linkDocElement: ICodeLinkElement | IHrefLinkElement = this.parseLinkTag(token, reportError);
            if (linkDocElement) {
              docElements.push(linkDocElement);
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
        reportError(`Unidentifiable Token ${token.type} ${token.tag} ${token.text}`);
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
  public static parseLinkTag(tokenItem: Token,
    reportError: (message: string) => void): IHrefLinkElement | ICodeLinkElement {
    if (!tokenItem.text) {
      reportError('Invalid @link inline token, a url or API definition reference must be given');
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
      reportError('Invalid @link parameters, at most pipe character allowed.');
      return;
    }

    // Try to guess if the tokenContent is a link or API definition reference
    let linkDocElement: ICodeLinkElement | IHrefLinkElement;
    if (tokenItem.text.match(this._hrefRegEx)) {
      const urlContent: string[] = pipeSplitContent[0].split(' ');

      // Make sure only a single url is given
      if (urlContent.length > 1 && urlContent[1] !== '' ) {
        reportError('Invalid @link parameter, url must be a single string.');
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
      const apiDefitionRef: IApiDefinitionReference = ApiDocumentation.parseApiReferenceExpression(
        pipeSplitContent[0], reportError);

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
        reportError('Display name in @link token may only contain alphabetic characters.');
        return;
      }
      // Full match is valid text
      linkDocElement.value = displayTextParts[0].trim();
    }

    return linkDocElement;
  }
}