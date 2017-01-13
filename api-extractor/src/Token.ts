/**
 * Allowed Token types.
 */
export enum TokenTypes {
  /**
   * A Token that contains only text.
   */
  Text,

  /**
   * A Token that specifies a tag.
   * Example: \@link, \@internal, etc.
   */
  Tag,

  /**
   * This is a specific kind of Tag that is important to 
   * distinguish because it contains additional parameters.
   * 
   * Example: 
   * \{@link http://microosft.com | microsoft home \}
   * \{@inheritdoc  @ microsoft/sp-core-library:Guid.newGuid \}
   */
  Inline
}

/**
 * A structured object created from a doc comment string within a JSDoc comment block.
 */
export default class Token {

  /**
   * The type of the token. 
   * Possible options: Text, Tag, Inline.
   */
  private _type: string;

  /**
   * This is not used for Text.
   */
  private _tag: string;

  /**
   * For inline tags, this is the parameter.
   * For text it is the text.
   */
  private _text: string;

  constructor(type: string, tag?: string, text?: string) {
    this._type = type;
    this._tag = tag ? tag : '';
    this._text = text ? this._unescape(text) : '';
    return this;
  }

  /**
   * Determines if the type is not what we expect.
   */
  public requireType(type: string): void {
    if (this._type !== type) {
      throw new Error('Token of type \"${this._type}\" is not of required type \"${type}\"');
    }
  }

  public get type(): string {
    return this._type;
  }

  public get tag(): string {
    return this._tag;
  }

  public get text(): string {
    return this._text;
  }

  private _unescape(text: string): string {
    return  text.replace('\\@', '@').replace('\\{', '{').replace('\\\\', '\\').replace('\\}', '}');
  }
}