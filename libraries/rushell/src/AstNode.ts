// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Token } from './Tokenizer.ts';
import { TextRange } from './TextRange.ts';

export enum AstKind {
  None = 'None',
  Script = 'Script',
  AndIf = 'AndIf',
  Command = 'Command',
  CompoundWord = 'CompoundWord',
  VariableExpansion = 'VariableExpansion',
  Text = 'Text'
}

/**
 * Base class for all AST nodes.
 */
export abstract class AstBaseNode {
  public readonly kind: AstKind = AstKind.None;
  public range: TextRange | undefined;

  /**
   * Returns a diagnostic dump of the tree, showing the prefix/suffix/separator for
   * each node.
   */
  public getDump(indent: string = ''): string {
    const nestedIndent: string = indent + '  ';
    let result: string = indent + `- ${this.kind}:\n`;

    const dumpText: string | undefined = this.getDumpText();
    if (dumpText) {
      result += nestedIndent + 'Value=' + JSON.stringify(dumpText) + '\n';
    }

    const fullRange: TextRange = this.getFullRange();
    if (!fullRange.isEmpty()) {
      result += nestedIndent + 'Range=' + JSON.stringify(fullRange.toString()) + '\n';
    }

    const childNodes: AstNode[] = this.getChildNodes();
    for (const child of childNodes) {
      result += child.getDump(nestedIndent);
    }

    return result;
  }

  public getChildNodes(): AstNode[] {
    const nodes: AstNode[] = [];
    this.collectChildNodesInto(nodes);
    return nodes;
  }

  public getFullRange(): TextRange {
    if (this.range) {
      return this.range;
    }

    let encompassingRange: TextRange = TextRange.empty;

    for (const child of this.getChildNodes()) {
      encompassingRange = encompassingRange.getEncompassingRange(child.getFullRange());
    }

    return encompassingRange;
  }

  protected abstract collectChildNodesInto(nodes: AstNode[]): void;

  protected getDumpText(): string | undefined {
    return undefined;
  }
}

/**
 * Represents a complete script that can be executed.
 */
export class AstScript extends AstBaseNode {
  public readonly kind: AstKind.Script = AstKind.Script;

  public body: AstNode | undefined;

  /** @override */
  protected collectChildNodesInto(nodes: AstNode[]): void {
    if (this.body) {
      nodes.push(this.body);
    }
  }
}

/**
 * Represents the "&&" operator, which is used to join two individual commands.
 */
export class AstAndIf extends AstBaseNode {
  public readonly kind: AstKind.AndIf = AstKind.AndIf;

  /**
   * The command that executes first, and always.
   */
  public firstCommand: AstCommand | undefined;

  /**
   * The command that executes second, and only if the first one succeeds.
   */
  public secondCommand: AstCommand | undefined;

  /** @override */
  protected collectChildNodesInto(nodes: AstNode[]): void {
    if (this.firstCommand) {
      nodes.push(this.firstCommand);
    }
    if (this.secondCommand) {
      nodes.push(this.secondCommand);
    }
  }
}

/**
 * Represents a command.  For example, the name of an executable to be started.
 */
export class AstCommand extends AstBaseNode {
  public readonly kind: AstKind.Command = AstKind.Command;

  public commandPath: AstCompoundWord | undefined;
  public arguments: AstCompoundWord[] = [];

  /** @override */
  protected collectChildNodesInto(nodes: AstNode[]): void {
    if (this.commandPath) {
      nodes.push(this.commandPath);
    }
    nodes.push(...this.arguments);
  }
}

/**
 * Represents a compound word, e.g. "--the-thing" or "./the/thing".
 */
export class AstCompoundWord extends AstBaseNode {
  public readonly kind: AstKind.CompoundWord = AstKind.CompoundWord;

  public readonly parts: AstNode[] = [];

  /** @override */
  protected collectChildNodesInto(nodes: AstNode[]): void {
    nodes.push(...this.parts);
  }
}

/**
 * Represents an environment variable expansion expression, e.g. "${VARIABLE}"
 */
export class AstVariableExpansion extends AstBaseNode {
  public readonly kind: AstKind.VariableExpansion = AstKind.VariableExpansion;

  /** @override */
  protected collectChildNodesInto(nodes: AstNode[]): void {
    // no children
  }
}

/**
 * Represents some plain text.
 */
export class AstText extends AstBaseNode {
  public readonly kind: AstKind.Text = AstKind.Text;

  public token: Token | undefined;

  /** @override */
  protected collectChildNodesInto(nodes: AstNode[]): void {
    // no children
  }

  /** @override */
  protected getDumpText(): string | undefined {
    if (this.token) {
      return this.token.text;
    }
    return undefined;
  }
}

export type AstNode = AstScript | AstAndIf | AstCommand | AstCompoundWord | AstVariableExpansion | AstText;
