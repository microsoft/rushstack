// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { StringBuilder } from '@microsoft/tsdoc';
import { Sort } from '@rushstack/node-core-library';

/**
 * Specifies various transformations that will be performed by Span.getModifiedText().
 */
export class SpanModification {
  /**
   * If true, all of the child spans will be omitted from the Span.getModifiedText() output.
   * @remarks
   * Also, the modify() operation will not recurse into these spans.
   */
  public omitChildren: boolean = false;

  /**
   * If true, then the Span.separator will be removed from the Span.getModifiedText() output.
   */
  public omitSeparatorAfter: boolean = false;

  /**
   * If true, then Span.getModifiedText() will sort the immediate children according to their Span.sortKey
   * property.  The separators will also be fixed up to ensure correct indentation.  If the Span.sortKey is undefined
   * for some items, those items will not be moved, i.e. their array indexes will be unchanged.
   */
  public sortChildren: boolean = false;

  /**
   * Used if the parent span has Span.sortChildren=true.
   */
  public sortKey: string | undefined;

  private readonly _span: Span;
  private _prefix: string | undefined;
  private _suffix: string | undefined;

  public constructor(span: Span) {
    this._span = span;
    this.reset();
  }

  /**
   * Allows the Span.prefix text to be changed.
   */
  public get prefix(): string {
    return this._prefix !== undefined ? this._prefix : this._span.prefix;
  }

  public set prefix(value: string) {
    this._prefix = value;
  }

  /**
   * Allows the Span.suffix text to be changed.
   */
  public get suffix(): string {
    return this._suffix !== undefined ? this._suffix : this._span.suffix;
  }

  public set suffix(value: string) {
    this._suffix = value;
  }

  /**
   * Reverts any modifications made to this object.
   */
  public reset(): void {
    this.omitChildren = false;
    this.omitSeparatorAfter = false;
    this.sortChildren = false;
    this.sortKey = undefined;
    this._prefix = undefined;
    this._suffix = undefined;
  }

  /**
   * Effectively deletes the Span from the tree, by skipping its children, skipping its separator,
   * and setting its prefix/suffix to the empty string.
   */
  public skipAll(): void {
    this.prefix = '';
    this.suffix = '';
    this.omitChildren = true;
    this.omitSeparatorAfter = true;
  }
}

/**
 * The Span class provides a simple way to rewrite TypeScript source files
 * based on simple syntax transformations, i.e. without having to process deeper aspects
 * of the underlying grammar.  An example transformation might be deleting JSDoc comments
 * from a source file.
 *
 * @remarks
 * TypeScript's abstract syntax tree (AST) is represented using Node objects.
 * The Node text ignores its surrounding whitespace, and does not have an ordering guarantee.
 * For example, a JSDocComment node can be a child of a FunctionDeclaration node, even though
 * the actual comment precedes the function in the input stream.
 *
 * The Span class is a wrapper for a single Node, that provides access to every character
 * in the input stream, such that Span.getText() will exactly reproduce the corresponding
 * full Node.getText() output.
 *
 * A Span is comprised of these parts, which appear in sequential order:
 * - A prefix
 * - A collection of child spans
 * - A suffix
 * - A separator (e.g. whitespace between this span and the next item in the tree)
 *
 * These parts can be modified via Span.modification.  The modification is applied by
 * calling Span.getModifiedText().
 */
export class Span {
  public readonly node: ts.Node;

  // To improve performance, substrings are not allocated until actually needed
  public readonly startIndex: number;
  public readonly endIndex: number;

  public readonly children: Span[];

  public readonly modification: SpanModification;

  private _parent: Span | undefined;
  private _previousSibling: Span | undefined;
  private _nextSibling: Span | undefined;

  private _separatorStartIndex: number;
  private _separatorEndIndex: number;

  public constructor(node: ts.Node) {
    this.node = node;
    this.startIndex = node.kind === ts.SyntaxKind.SourceFile ? node.getFullStart() : node.getStart();
    this.endIndex = node.end;
    this._separatorStartIndex = 0;
    this._separatorEndIndex = 0;
    this.children = [];
    this.modification = new SpanModification(this);

    let previousChildSpan: Span | undefined = undefined;

    for (const childNode of this.node.getChildren() || []) {
      const childSpan: Span = new Span(childNode);
      childSpan._parent = this;
      childSpan._previousSibling = previousChildSpan;

      if (previousChildSpan) {
        previousChildSpan._nextSibling = childSpan;
      }

      this.children.push(childSpan);

      // Normalize the bounds so that a child is never outside its parent
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
          // deepest preceding span with no suffix.  This heuristic simplifies the most
          // common transformations, and otherwise it can be fished out using getLastInnerSeparator().
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
          separatorRecipient._separatorStartIndex = previousChildSpan.endIndex;
          separatorRecipient._separatorEndIndex = childSpan.startIndex;
        }
      }

      previousChildSpan = childSpan;
    }
  }

  public get kind(): ts.SyntaxKind {
    return this.node.kind;
  }

  /**
   * The parent Span, if any.
   * NOTE: This will be undefined for a root Span, even though the corresponding Node
   * may have a parent in the AST.
   */
  public get parent(): Span | undefined {
    return this._parent;
  }

  /**
   * If the current object is this.parent.children[i], then previousSibling corresponds
   * to this.parent.children[i-1] if it exists.
   * NOTE: This will be undefined for a root Span, even though the corresponding Node
   * may have a previous sibling in the AST.
   */
  public get previousSibling(): Span | undefined {
    return this._previousSibling;
  }

  /**
   * If the current object is this.parent.children[i], then previousSibling corresponds
   * to this.parent.children[i+1] if it exists.
   * NOTE: This will be undefined for a root Span, even though the corresponding Node
   * may have a previous sibling in the AST.
   */
  public get nextSibling(): Span | undefined {
    return this._nextSibling;
  }

  /**
   * The text associated with the underlying Node, up to its first child.
   */
  public get prefix(): string {
    if (this.children.length) {
      // Everything up to the first child
      return this._getSubstring(this.startIndex, this.children[0].startIndex);
    } else {
      return this._getSubstring(this.startIndex, this.endIndex);
    }
  }

  /**
   * The text associated with the underlying Node, after its last child.
   * If there are no children, this is always an empty string.
   */
  public get suffix(): string {
    if (this.children.length) {
      // Everything after the last child
      return this._getSubstring(this.children[this.children.length - 1].endIndex, this.endIndex);
    } else {
      return '';
    }
  }

  /**
   * Whitespace that appeared after this node, and before the "next" node in the tree.
   * Here we mean "next" according to an inorder traversal, not necessarily a sibling.
   */
  public get separator(): string {
    return this._getSubstring(this._separatorStartIndex, this._separatorEndIndex);
  }

  /**
   * Returns the separator of this Span, or else recursively calls getLastInnerSeparator()
   * on the last child.
   */
  public getLastInnerSeparator(): string {
    if (this.separator) {
      return this.separator;
    }
    if (this.children.length > 0) {
      return this.children[this.children.length - 1].getLastInnerSeparator();
    }
    return '';
  }

  /**
   * Returns the first parent node with the specified  SyntaxKind, or undefined if there is no match.
   */
  public findFirstParent(kindToMatch: ts.SyntaxKind): Span | undefined {
    let current: Span | undefined = this;

    while (current) {
      if (current.kind === kindToMatch) {
        return current;
      }
      current = current.parent;
    }

    return undefined;
  }

  /**
   * Starting from the first character of this span, walk backwards until we find the start of the line,
   * and return whitespace after that position.
   *
   * @remarks
   * For example, suppose the character buffer contains this text:
   * ```
   *              1111111111222222
   *  012345 6 7890123456789012345
   * "line 1\r\n  line 2 Example"
   * ```
   *
   * And suppose the span starts at index 17, i.e. the the "E" in example.  The `getIndent()` method would return
   * two spaces corresponding to the range from index 8 through and including index 9.
   */
  public getIndent(): string {
    const buffer: string = this.node.getSourceFile().text;

    let lineStartIndex: number = 0;
    let firstNonSpaceIndex: number = this.startIndex;

    let i: number = this.startIndex - 1;
    while (i >= 0) {
      const c: number = buffer.charCodeAt(i);
      if (c === 13 /* \r */ || c === 10 /* \n */) {
        lineStartIndex = i + 1;
        break;
      }
      if (c !== 32 /* space */ && c !== 9 /* tab */) {
        // We encountered a non-spacing character, so move the firstNonSpaceIndex backwards
        firstNonSpaceIndex = i;
      }
      --i;
    }

    return buffer.substring(lineStartIndex, firstNonSpaceIndex);
  }

  /**
   * Recursively invokes the callback on this Span and all its children.  The callback
   * can make changes to Span.modification for each node.
   */
  public forEach(callback: (span: Span) => void): void {
    callback(this);
    for (const child of this.children) {
      child.forEach(callback);
    }
  }

  /**
   * Returns the original unmodified text represented by this Span.
   */
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

  /**
   * Returns the text represented by this Span, after applying all requested modifications.
   */
  public getModifiedText(): string {
    const output: StringBuilder = new StringBuilder();

    this._writeModifiedText({
      output,
      separatorOverride: undefined,
    });

    return output.toString();
  }

  public writeModifiedText(output: StringBuilder): void {
    this._writeModifiedText({
      output,
      separatorOverride: undefined,
    });
  }

  /**
   * Returns a diagnostic dump of the tree, showing the prefix/suffix/separator for
   * each node.
   */
  public getDump(indent: string = ''): string {
    let result: string = indent + ts.SyntaxKind[this.node.kind] + ': ';

    if (this.prefix) {
      result += ' pre=[' + this._getTrimmed(this.prefix) + ']';
    }
    if (this.suffix) {
      result += ' suf=[' + this._getTrimmed(this.suffix) + ']';
    }
    if (this.separator) {
      result += ' sep=[' + this._getTrimmed(this.separator) + ']';
    }
    result += '\n';

    for (const child of this.children) {
      result += child.getDump(indent + '  ');
    }

    return result;
  }

  private _writeModifiedText(options: IWriteModifiedTextOptions): void {
    options.output.append(this.modification.prefix);

    const childCount: number = this.children.length;

    if (!this.modification.omitChildren) {
      if (this.modification.sortChildren && childCount > 1) {
        // We will only sort the items with a sortKey
        const sortedSubset: Span[] = this.children.filter((x) => x.modification.sortKey !== undefined);
        const sortedSubsetCount: number = sortedSubset.length;

        // Is there at least one of them?
        if (sortedSubsetCount > 1) {
          // Remember the separator for the first and last ones
          const firstSeparator: string = sortedSubset[0].getLastInnerSeparator();
          const lastSeparator: string = sortedSubset[sortedSubsetCount - 1].getLastInnerSeparator();

          Sort.sortBy(sortedSubset, (x) => x.modification.sortKey);

          const childOptions: IWriteModifiedTextOptions = { ...options };

          let sortedSubsetIndex: number = 0;
          for (let index: number = 0; index < childCount; ++index) {
            let current: Span;

            // Is this an item that we sorted?
            if (this.children[index].modification.sortKey === undefined) {
              // No, take the next item from the original array
              current = this.children[index];
              childOptions.separatorOverride = undefined;
            } else {
              // Yes, take the next item from the sortedSubset
              current = sortedSubset[sortedSubsetIndex++];

              if (sortedSubsetIndex < sortedSubsetCount) {
                childOptions.separatorOverride = firstSeparator;
              } else {
                childOptions.separatorOverride = lastSeparator;
              }
            }

            current._writeModifiedText(childOptions);
          }

          return;
        }
        // (fall through to the other implementations)
      }

      if (options.separatorOverride !== undefined) {
        // Special case where the separatorOverride is passed down to the "last inner separator" span
        for (let i: number = 0; i < childCount; ++i) {
          const child: Span = this.children[i];

          if (
            // Only the last child inherits the separatorOverride, because only it can contain
            // the "last inner separator" span
            i < childCount - 1 ||
            // If this.separator is specified, then we will write separatorOverride below, so don't pass it along
            this.separator
          ) {
            const childOptions: IWriteModifiedTextOptions = { ...options };
            childOptions.separatorOverride = undefined;
            child._writeModifiedText(childOptions);
          } else {
            child._writeModifiedText(options);
          }
        }
      } else {
        // The normal simple case
        for (const child of this.children) {
          child._writeModifiedText(options);
        }
      }
    }

    options.output.append(this.modification.suffix);

    if (options.separatorOverride !== undefined) {
      if (this.separator || childCount === 0) {
        options.output.append(options.separatorOverride);
      }
    } else {
      if (!this.modification.omitSeparatorAfter) {
        options.output.append(this.separator);
      }
    }
  }

  private _getTrimmed(text: string): string {
    const trimmed: string = text.replace(/\r?\n/g, '\\n');

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

interface IWriteModifiedTextOptions {
  output: StringBuilder;
  separatorOverride: string | undefined;
}
