// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Token } from './Tokenizer';

export enum AstKind {
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
export abstract class AstNode {
  public abstract get kind(): AstKind;

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

    const childNodes: AstNode[] = this.getChildNodes();
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

  public getChildNodes(): AstNode[] {
    const nodes: AstNode[] = [];
    this.pushChildNodes(nodes);
    return nodes;
  }

  protected abstract pushChildNodes(nodes: AstNode[]): void;

  protected getDumpText(): string | undefined{
    return undefined;
  }
}

export class AstScript extends AstNode {
  public body: AstNode | undefined;

  public get kind(): AstKind {
    return AstKind.Script;
  }

  /** @override */
  protected pushChildNodes(nodes: AstNode[]): void {
    if (this.body) {
      nodes.push(this.body);
    }
  }
}

export class AstAndIf extends AstNode {
  /**
   * The command that executes first, and always.
   */
  public firstCommand: AstCommand | undefined;

  /**
   * The command that executes second, and only if the first one succeeds.
   */
  public secondCommand: AstCommand | undefined;

  public get kind(): AstKind {
    return AstKind.AndIf;
  }

  /** @override */
  protected pushChildNodes(nodes: AstNode[]): void {
    if (this.firstCommand) {
      nodes.push(this.firstCommand);
    }
    if (this.secondCommand) {
      nodes.push(this.secondCommand);
    }
  }
}

export class AstCommand extends AstNode {
  public commandPath: AstCompoundWord | undefined;
  public arguments: AstCompoundWord[] = [];

  public get kind(): AstKind {
    return AstKind.Command;
  }

  /** @override */
  protected pushChildNodes(nodes: AstNode[]): void {
    if (this.commandPath) {
      nodes.push(this.commandPath);
    }
    nodes.push(...this.arguments);
  }
}

export class AstCompoundWord extends AstNode {
  public readonly parts: AstNode[] = [];

  public get kind(): AstKind {
    return AstKind.CompoundWord;
  }

  /** @override */
  protected pushChildNodes(nodes: AstNode[]): void {
    nodes.push(...this.parts);
  }
}

export class AstVariableExpansion extends AstNode {
  public get kind(): AstKind {
    return AstKind.VariableExpansion;
  }

  /** @override */
  protected pushChildNodes(nodes: AstNode[]): void {
    // no children
  }
}

export class AstText extends AstNode {
  public token: Token | undefined;
  public get kind(): AstKind {
    return AstKind.Text;
  }

  /** @override */
  protected pushChildNodes(nodes: AstNode[]): void {
    // no children
  }

  /** @override */
  protected getDumpText(): string | undefined{
    if (this.token) {
      return this.token.text;
    }
    return undefined;
  }
}
