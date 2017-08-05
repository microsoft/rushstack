// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

export class Span {
  public readonly node: ts.Node;

  public readonly startIndex: number;
  public readonly endIndex: number;
  public separatorIndex: number;

  public readonly children: Span[];

  public constructor(node: ts.Node) {
    this.node = node;
    this.startIndex = node.getStart();
    this.endIndex = node.end;
    this.separatorIndex = this.endIndex;
    this.children = [];

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
        previousChildSpan.separatorIndex = childSpan.startIndex;
      }

      previousChildSpan = childSpan;
    }
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
    return this._getSubstring(this.endIndex, this.separatorIndex);
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
    return this.node.getSourceFile().text.substring(startIndex, endIndex);
  }
}
