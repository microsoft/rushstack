// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

export type SpanModifyCallback = (span: Span, previousSpan: Span | undefined, parentSpan: Span | undefined) => void;

export class SpanModification {
  public skipChildren: boolean;
  public skipSeparatorAfter: boolean;

  private readonly span: Span;
  private _prefix: string | undefined;
  private _suffix: string | undefined;

  public constructor(span: Span) {
    this.span = span;
    this.reset();
  }

  public get prefix(): string {
    return this._prefix !== undefined ? this._prefix : this.span.prefix;
  }

  public set prefix(value: string) {
    this._prefix = value;
  }

  public get suffix(): string {
    return this._suffix !== undefined ? this._suffix : this.span.suffix;
  }

  public set suffix(value: string) {
    this._suffix = value;
  }

  public reset(): void {
    this.skipChildren = false;
    this.skipSeparatorAfter = false;
    this._prefix = undefined;
    this._suffix = undefined;
  }

  public skipAll(): void {
    this.prefix = '';
    this.suffix = '';
    this.skipChildren = true;
    this.skipSeparatorAfter = true;
  }
}

export class Span {
  public readonly node: ts.Node;

  public readonly startIndex: number;
  public readonly endIndex: number;
  public separatorStartIndex: number;
  public separatorEndIndex: number;

  public readonly children: Span[];

  public readonly modification: SpanModification;

  private static _modifyHelper(callback: SpanModifyCallback, spans: Span[], parentSpan: Span|undefined): void {
    let previousSpan: Span|undefined = undefined;

    for (const span of spans) {
      callback(span, previousSpan, parentSpan);

      Span._modifyHelper(callback, span.children, span);

      previousSpan = span;
    }
  }

  public constructor(node: ts.Node) {
    this.node = node;
    this.startIndex = node.getStart();
    this.endIndex = node.end;
    this.separatorStartIndex = 0;
    this.separatorEndIndex = 0;
    this.children = [];
    this.modification = new SpanModification(this);

    let previousChildSpan: Span = undefined;

    for (const childNode of this.node.getChildren() || []) {
      const childSpan: Span = new Span(childNode);
      this.children.push(childSpan);

      if (childSpan.startIndex < this.startIndex) {
        this.startIndex = childSpan.startIndex;
      }

      if (childSpan.endIndex > this.endIndex) {
        // This has never been observed empirically, but here's how we would handle it
        this.endIndex = childSpan.endIndex;
        throw new Error('Unexpected AST case');
      }

      if (previousChildSpan) {
        if (previousChildSpan.endIndex < childSpan.startIndex) {
          // There is some leftover text after previous child -- assign it as the separator for
          // the preceding span.  If the preceding span has no suffix, then assign it to the
          // deepest preceding span with no suffix.
          let separatorRecipient: Span = previousChildSpan;
          while (separatorRecipient.children.length > 0) {
            const lastChild: Span = separatorRecipient.children[separatorRecipient.children.length - 1];
            if (lastChild.endIndex !== separatorRecipient.endIndex) {
              // There is a suffix, so we cannot push the separator any further down, or else
              // it would get printed before this suffix.
              break;
            }
            separatorRecipient = lastChild;
          }
          separatorRecipient.separatorStartIndex = previousChildSpan.endIndex;
          separatorRecipient.separatorEndIndex = childSpan.startIndex;
        }
      }

      previousChildSpan = childSpan;
    }
  }

  public get kind(): ts.SyntaxKind {
    return this.node.kind;
  }

  public get prefix(): string {
    if (this.children.length) {
      // Everything up to the first child
      return this._getSubstring(this.startIndex, this.children[0].startIndex);
    } else {
      return this._getSubstring(this.startIndex, this.endIndex);
    }
  }

  public get suffix(): string {
    if (this.children.length) {
      // Everything after the last child
      return this._getSubstring(this.children[this.children.length - 1].endIndex, this.endIndex);
    } else {
      return '';
    }
  }

  public get separator(): string {
    return this._getSubstring(this.separatorStartIndex, this.separatorEndIndex);
  }

  public getLastInnerSeparator(): string {
    if (this.separator) {
      return this.separator;
    }
    if (this.children.length > 0) {
      return this.children[this.children.length - 1].getLastInnerSeparator();
    }
    return '';
  }

  public modify(callback: SpanModifyCallback): void {
    Span._modifyHelper(callback, [this], undefined);
  }

  public getText(): string {
    let result: string = '';
    result += this.prefix;

    for (const child of this.children) {
      result += child.getText();
    }

    result += this.suffix;
    result += this.separator;

    return result;
  }

  public getModifiedText(): string {
    let result: string = '';
    result += this.modification.prefix;

    if (!this.modification.skipChildren) {
      for (const child of this.children) {
        result += child.getModifiedText();
      }
    }

    result += this.modification.suffix;
    if (!this.modification.skipSeparatorAfter) {
      result += this.separator;
    }

    return result;
  }

  public dump(indent: string = ''): void {
    let line: string = indent + ts.SyntaxKind[this.node.kind] + ': ';

    if (this.prefix) {
      line += ' pre=[' + this._getTrimmed(this.prefix) + ']';
    }
    if (this.suffix) {
      line += ' suf=[' + this._getTrimmed(this.suffix) + ']';
    }
    if (this.separator) {
      line += ' sep=[' + this._getTrimmed(this.separator) + ']';
    }

    console.log(line);

    for (const child of this.children) {
      child.dump(indent + '  ');
    }
  }

  private _getTrimmed(text: string): string {
    const trimmed: string = text.replace(/[\r\n]/g, '\\n');

    if (trimmed.length > 100) {
      return trimmed.substr(0, 97) + '...';
    }
    return trimmed;
  }

  private _getSubstring(startIndex: number, endIndex: number): string {
    if (startIndex === endIndex) {
      return '';
    }
    return this.node.getSourceFile().text.substring(startIndex, endIndex);
  }
}
