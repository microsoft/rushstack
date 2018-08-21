// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Token } from './Tokenizer';

export enum AstKind {
  None,
  Script,
  AndIf,
  Command,
  CompoundWord,
  VariableExpansion,
  Text
}

/**
 * Base class for all AST nodes.
 */
export abstract class AstBaseNode {
  public readonly kind: AstKind = AstKind.None;

  /**
   * Returns a diagnostic dump of the tree, showing the prefix/suffix/separator for
   * each node.
   */
  public getDump(indent: string = ''): string {
    let result: string = indent + AstKind[this.kind];

    const dumpText: string | undefined = this.getDumpText();
    if (dumpText) {
      result += '=' + JSON.stringify(dumpText);
    }

    const childNodes: AstBaseNode[] = this.getChildNodes();
    if (childNodes.length === 0) {
      result += '\n';
    } else {
      result += ':\n';
      for (const child of this.getChildNodes()) {
        result += child.getDump(indent + '  ');
      }
    }

    return result;
  }

  public getChildNodes(): AstBaseNode[] {
    const nodes: AstBaseNode[] = [];
    this.collectChildNodesInto(nodes);
    return nodes;
  }

  protected abstract collectChildNodesInto(nodes: AstBaseNode[]): void;

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
  protected collectChildNodesInto(nodes: AstBaseNode[]): void {
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
  protected collectChildNodesInto(nodes: AstBaseNode[]): void {
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
  protected collectChildNodesInto(nodes: AstBaseNode[]): void {
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

  public readonly parts: AstBaseNode[] = [];

  /** @override */
  protected collectChildNodesInto(nodes: AstBaseNode[]): void {
    nodes.push(...this.parts);
  }
}

/**
 * Represents an environment variable expansion expression, e.g. "${VARIABLE}"
 */
export class AstVariableExpansion extends AstBaseNode {
  public readonly kind: AstKind.VariableExpansion = AstKind.VariableExpansion;

  /** @override */
  protected collectChildNodesInto(nodes: AstBaseNode[]): void {
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
  protected collectChildNodesInto(nodes: AstBaseNode[]): void {
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
