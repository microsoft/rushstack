import { IDocElement } from './IDocElement';

export default class DocElementParser {

  public static makeTextElement(text: string): IDocElement {
    return {kind: 'textDocElement', value: text};
  }

  public static parse(tokenStream: string[]): IDocElement[] {
    const summaryDocElements: IDocElement[] = [];
    let parsing: boolean = true;
    let token: string;

    while (parsing) {
      token = this._peek(tokenStream);
      if (!token) {
        parsing = false; // end of stream
      } else if (token === '@see') {
        tokenStream.shift();
        summaryDocElements.push({
          kind: 'seeDocElement',
          seeElements: this.parse(tokenStream)
        });
      } else if (token.substring(0, 6) === '{@link') {
        // ? Raise error if there is no space after link ?      
        summaryDocElements.push({
            kind: 'linkDocElement',
            targetUrl: token.substring(7, token.length - 1).trim()
        });
        tokenStream.shift(); // pop the link token 
      } else if (this._isTextSymbol(token)) {
        summaryDocElements.push({kind: 'textDocElement', value: token});
        tokenStream.shift();
      } else {
        parsing = false; // end of summary tokens
      }
    }
    return summaryDocElements;
  }

    private static _isTextSymbol(token: string): boolean {
      // any non '@' || '{' char is treated as text 
      return token.charAt(0) !== '@' && token.charAt(0) !== '{';
  }

  private static _peek(tokenStream: string[]): string {
      return tokenStream.length === 0 ? undefined : tokenStream[0];
  }
}