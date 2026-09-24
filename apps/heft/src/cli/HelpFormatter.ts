// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This is a faithful TypeScript port of the HelpFormatter from the "argparse" package, version 1.0.10
// (lib/help/formatter.js; Copyright (C) 2012 by Vitaly Puzrin; MIT license), which is the version that
// @rushstack/ts-command-line uses. It exists so that Heft can render byte-identical help text without loading
// argparse. The behavior, including its quirks, must match the original exactly; it is covered by tests that
// compare its output with argparse's.
//
// Simplifications that do not affect the output for the parsers that ts-command-line builds:
// - mutually exclusive groups are not supported (ts-command-line does not create them)
// - `usage` is always generated (ts-command-line never provides one)
// - help strings are used as-is instead of being expanded with sprintf(); ts-command-line escapes every "%"
//   before passing text to argparse, so sprintf() is the identity function for that text

import {
  ONE_OR_MORE,
  OPTIONAL,
  PARSER,
  REMAINDER,
  SUPPRESS,
  ZERO_OR_MORE,
  type IHelpAction,
  type IHelpParser
} from './HelpModel';

const EOL: string = '\n';

function isOptional(action: IHelpAction): boolean {
  return action.optionStrings.length !== 0;
}

// All callers pass integers; like the original, a non-positive count produces an empty string.
function repeat(str: string, num: number): string {
  return num > 0 ? str.repeat(num) : '';
}

const WHITESPACE_REGEXP: RegExp = /\s+/g;
const LONG_BREAK_REGEXP: RegExp = new RegExp(EOL + EOL + EOL + '+', 'g');
const SPLIT_LINES_DELIMITERS: string[] = [' ', '.', ',', '!', '?'];
const SPLIT_LINES_DELIMITER_REGEXP: RegExp = new RegExp(
  '[' + SPLIT_LINES_DELIMITERS.join('') + '][^' + SPLIT_LINES_DELIMITERS.join('') + ']*$'
);
const USAGE_PART_REGEXP: RegExp = new RegExp('\\(.*?\\)+|\\[.*?\\]+|\\S+', 'g');

function trimChars(str: string, chars: string): string {
  let start: number = 0;
  let end: number = str.length - 1;
  while (chars.indexOf(str.charAt(start)) >= 0) {
    start++;
  }
  while (chars.indexOf(str.charAt(end)) >= 0) {
    end--;
  }
  return str.slice(start, end + 1);
}

type HelpItem = () => string;

class Section {
  public readonly parent: Section | undefined;
  readonly #heading: string | undefined;
  readonly #items: HelpItem[] = [];

  public constructor(parent: Section | undefined, heading?: string) {
    this.parent = parent;
    this.#heading = heading;
  }

  public addItem(item: HelpItem): void {
    this.#items.push(item);
  }

  public formatHelp(formatter: HelpFormatter): string {
    // format the indented section
    if (this.parent) {
      formatter.indent();
    }

    const itemHelp: string = formatter.joinParts(this.#items.map((item: HelpItem) => item()));

    if (this.parent) {
      formatter.dedent();
    }

    // return nothing if the section was empty
    if (!itemHelp) {
      return '';
    }

    // add the heading if the section was non-empty
    let heading: string = '';
    if (this.#heading && this.#heading !== SUPPRESS) {
      // The original indents the heading by `formatter.currentIndent`, which is not a property of its formatter
      // (the property is named `_currentIndent`), so headings are never indented.
      heading = this.#heading + ':' + EOL;
    }

    // join the section-initialize newline, the heading and the help
    return formatter.joinParts([EOL, heading, itemHelp, EOL]);
  }
}

export class HelpFormatter {
  public currentIndent: number = 0;

  readonly #prog: string;
  readonly #maxHelpPosition: number = 24;
  readonly #width: number;
  readonly #indentIncrement: number = 2;
  #actionMaxLength: number = 0;
  readonly #rootSection: Section;
  #currentSection: Section;

  public constructor(prog: string) {
    this.#prog = prog;
    // Mirrors: (options.width || ((process.env.COLUMNS || 80) - 2))
    this.#width = ((process.env.COLUMNS || 80) as number) - 2;
    this.#rootSection = new Section(undefined);
    this.#currentSection = this.#rootSection;
  }

  public indent(): void {
    this.currentIndent += this.#indentIncrement;
  }

  public dedent(): void {
    this.currentIndent -= this.#indentIncrement;
    if (this.currentIndent < 0) {
      throw new Error('Indent decreased below 0.');
    }
  }

  public startSection(heading: string): void {
    this.indent();
    const section: Section = new Section(this.#currentSection, heading);
    this.#addItem(() => section.formatHelp(this));
    this.#currentSection = section;
  }

  public endSection(): void {
    this.#currentSection = this.#currentSection.parent!;
    this.dedent();
  }

  public addText(text: string | undefined): void {
    if (text && text !== SUPPRESS) {
      this.#addItem(() => this.#formatText(text));
    }
  }

  public addUsage(actions: ReadonlyArray<IHelpAction>, prefix?: string): void {
    this.#addItem(() => this.#formatUsage(actions, prefix));
  }

  public addArgument(action: IHelpAction): void {
    if (action.help !== SUPPRESS) {
      let invocationLength: number = this.#formatActionInvocation(action).length;

      if (action.subactions) {
        this.indent();
        for (const subaction of action.subactions) {
          const invocationNew: string = this.#formatActionInvocation(subaction);
          invocationLength = Math.max(invocationLength, invocationNew.length);
        }
        this.dedent();
      }

      const actionLength: number = invocationLength + this.currentIndent;
      this.#actionMaxLength = Math.max(this.#actionMaxLength, actionLength);

      this.#addItem(() => this.#formatAction(action));
    }
  }

  public addArguments(actions: ReadonlyArray<IHelpAction>): void {
    for (const action of actions) {
      this.addArgument(action);
    }
  }

  public formatHelp(): string {
    let help: string = this.#rootSection.formatHelp(this);
    if (help) {
      help = help.replace(LONG_BREAK_REGEXP, EOL + EOL);
      help = trimChars(help, EOL) + EOL;
    }
    return help;
  }

  public joinParts(partStrings: ReadonlyArray<string | undefined>): string {
    return partStrings.filter((part: string | undefined) => part && part !== SUPPRESS).join('');
  }

  #addItem(item: HelpItem): void {
    this.#currentSection.addItem(item);
  }

  #formatUsage(actions: ReadonlyArray<IHelpAction>, prefix: string | undefined): string {
    if (!prefix && typeof prefix !== 'string') {
      prefix = 'usage: ';
    }

    let usage: string;
    if (actions.length === 0) {
      usage = this.#prog;
    } else {
      const prog: string = this.#prog;
      const optionals: IHelpAction[] = [];
      const positionals: IHelpAction[] = [];

      for (const action of actions) {
        if (isOptional(action)) {
          optionals.push(action);
        } else {
          positionals.push(action);
        }
      }

      const actionUsage: string = this.#formatActionsUsage([...optionals, ...positionals]);
      usage = [prog, actionUsage].join(' ');

      const textWidth: number = this.#width - this.currentIndent;
      if (prefix.length + usage.length > textWidth) {
        // break usage into wrappable parts
        const optionalUsage: string = this.#formatActionsUsage(optionals);
        const positionalUsage: string = this.#formatActionsUsage(positionals);

        // `match()` returns null if there are no matches
        const optionalParts: string[] | undefined = optionalUsage.match(USAGE_PART_REGEXP) ?? undefined;
        const positionalParts: string[] = positionalUsage.match(USAGE_PART_REGEXP) || [];

        if (optionalParts!.join(' ') !== optionalUsage) {
          throw new Error('assert "optionalParts.join(\' \') === optionalUsage"');
        }
        if (positionalParts.join(' ') !== positionalUsage) {
          throw new Error('assert "positionalParts.join(\' \') === positionalUsage"');
        }

        // helper for wrapping lines
        const getLines: (parts: string[], indent: string, linePrefix?: string) => string[] = (
          parts: string[],
          indent: string,
          linePrefix?: string
        ): string[] => {
          const lines: string[] = [];
          let line: string[] = [];

          let lineLength: number = linePrefix ? linePrefix.length - 1 : indent.length - 1;

          for (const part of parts) {
            if (lineLength + 1 + part.length > textWidth) {
              lines.push(indent + line.join(' '));
              line = [];
              lineLength = indent.length - 1;
            }
            line.push(part);
            lineLength += part.length + 1;
          }

          // NOTE: an empty array is truthy, so this always adds a line (possibly containing only the indent)
          if (line) {
            lines.push(indent + line.join(' '));
          }
          if (linePrefix) {
            lines[0] = lines[0].substr(indent.length);
          }
          return lines;
        };

        let lines: string[];
        // if prog is short, follow it with optionals or positionals
        if (prefix.length + prog.length <= 0.75 * textWidth) {
          const indent: string = repeat(' ', prefix.length + prog.length + 1);
          if (optionalParts) {
            lines = [
              ...getLines([prog, ...optionalParts], indent, prefix),
              ...getLines(positionalParts, indent)
            ];
          } else if (positionalParts) {
            lines = getLines([prog, ...positionalParts], indent, prefix);
          } else {
            lines = [prog];
          }
        } else {
          // if prog is long, put it on its own line
          const indent: string = repeat(' ', prefix.length);
          const parts: string[] = [...optionalParts!, ...positionalParts];
          lines = getLines(parts, indent);
          if (lines.length > 1) {
            lines = [...getLines(optionalParts!, indent), ...getLines(positionalParts, indent)];
          }
          lines = [prog, ...lines];
        }
        // join lines into usage
        usage = lines.join(EOL);
      }
    }

    // prefix with 'usage:'
    return prefix + usage + EOL + EOL;
  }

  #formatActionsUsage(actions: ReadonlyArray<IHelpAction>): string {
    const parts: (string | undefined)[] = [];

    // collect all actions format strings
    for (const action of actions) {
      if (action.help === SUPPRESS) {
        // suppressed arguments are marked with None
        parts.push(undefined);
      } else if (!isOptional(action)) {
        // produce all arg strings
        parts.push(this.#formatArgs(action, action.dest));
      } else {
        // produce the first way to invoke the option in brackets
        const optionString: string = action.optionStrings[0];

        let part: string;
        // if the Optional doesn't take a value, format is: -s or --long
        if (action.nargs === 0) {
          part = '' + optionString;
        } else {
          // if the Optional takes a value, format is: -s ARGS or --long ARGS
          const argsDefault: string = action.dest.toUpperCase();
          const argsString: string = this.#formatArgs(action, argsDefault);
          part = optionString + ' ' + argsString;
        }
        // make it look optional if it's not required or in a group
        if (!action.required) {
          part = '[' + part + ']';
        }
        parts.push(part);
      }
    }

    // join all the action items with spaces
    let text: string = parts.filter((part: string | undefined) => !!part).join(' ');

    // clean up separators for mutually exclusive groups; remove empty groups
    text = text.replace(/([\[(]) /g, '$1');
    text = text.replace(/ ([\])])/g, '$1');
    text = text.replace(/\[ *\]/g, '');
    text = text.replace(/\( *\)/g, '');
    text = text.replace(/\(([^|]*)\)/g, '$1');

    text = text.trim();

    // return the text
    return text;
  }

  #formatText(text: string): string {
    const textWidth: number = this.#width - this.currentIndent;
    const indentIncrement: string = repeat(' ', this.currentIndent);
    return this.#fillText(text, textWidth, indentIncrement) + EOL + EOL;
  }

  #formatAction(action: IHelpAction): string {
    // determine the required width and the entry label
    const helpPosition: number = Math.min(this.#actionMaxLength + 2, this.#maxHelpPosition);
    const helpWidth: number = this.#width - helpPosition;
    const actionWidth: number = helpPosition - this.currentIndent - 2;
    let actionHeader: string = this.#formatActionInvocation(action);
    let indentFirst: number = 0;

    // no help; start on same line and add a final newline
    if (!action.help) {
      actionHeader = repeat(' ', this.currentIndent) + actionHeader + EOL;
    } else if (actionHeader.length <= actionWidth) {
      // short action name; start on the same line and pad two spaces
      actionHeader =
        repeat(' ', this.currentIndent) + actionHeader + '  ' + repeat(' ', actionWidth - actionHeader.length);
      indentFirst = 0;
    } else {
      // long action name; start on the next line
      actionHeader = repeat(' ', this.currentIndent) + actionHeader + EOL;
      indentFirst = helpPosition;
    }

    // collect the pieces of the action help
    const parts: string[] = [actionHeader];

    // if there was help for the action, add lines of help text
    if (action.help) {
      const helpLines: string[] = this.#splitLines(action.help, helpWidth);
      parts.push(repeat(' ', indentFirst) + helpLines[0] + EOL);
      for (const line of helpLines.slice(1)) {
        parts.push(repeat(' ', helpPosition) + line + EOL);
      }
    } else if (actionHeader.charAt(actionHeader.length - 1) !== EOL) {
      // or add a newline if the description doesn't end with one
      parts.push(EOL);
    }

    // if there are any sub-actions, add their help as well
    if (action.subactions) {
      this.indent();
      for (const subaction of action.subactions) {
        parts.push(this.#formatAction(subaction));
      }
      this.dedent();
    }

    // return a single string
    return this.joinParts(parts);
  }

  #formatActionInvocation(action: IHelpAction): string {
    if (!isOptional(action)) {
      return this.#metavarFormatter(action, action.dest)(1)[0];
    }

    const parts: string[] = [];

    // if the Optional doesn't take a value, format is: -s, --long
    if (action.nargs === 0) {
      parts.push(...action.optionStrings);
    } else {
      // if the Optional takes a value, format is: -s ARGS, --long ARGS
      const argsDefault: string = action.dest.toUpperCase();
      const argsString: string = this.#formatArgs(action, argsDefault);
      for (const optionString of action.optionStrings) {
        parts.push(optionString + ' ' + argsString);
      }
    }
    return parts.join(', ');
  }

  #metavarFormatter(action: IHelpAction, metavarDefault: string): (size: number) => string[] {
    let result: string;

    if (action.metavar || action.metavar === '') {
      result = action.metavar;
    } else if (action.choices) {
      const choices: ReadonlyArray<string> | Record<string, unknown> = action.choices;
      let choicesString: string;
      if (Array.isArray(choices)) {
        choicesString = choices.join(',');
      } else {
        choicesString = Object.keys(choices).join(',');
      }
      result = '{' + choicesString + '}';
    } else {
      result = metavarDefault;
    }

    return (size: number): string[] => {
      const metavars: string[] = [];
      for (let i: number = 0; i < size; i += 1) {
        metavars.push(result);
      }
      return metavars;
    };
  }

  #formatArgs(action: IHelpAction, metavarDefault: string): string {
    const buildMetavar: (size: number) => string[] = this.#metavarFormatter(action, metavarDefault);

    let metavars: string[];
    switch (action.nargs) {
      case undefined:
        metavars = buildMetavar(1);
        return '' + metavars[0];
      case OPTIONAL:
        metavars = buildMetavar(1);
        return '[' + metavars[0] + ']';
      case ZERO_OR_MORE:
        metavars = buildMetavar(2);
        return '[' + metavars[0] + ' [' + metavars[1] + ' ...]]';
      case ONE_OR_MORE:
        metavars = buildMetavar(2);
        return '' + metavars[0] + ' [' + metavars[1] + ' ...]';
      case REMAINDER:
        return '...';
      case PARSER:
        metavars = buildMetavar(1);
        return metavars[0] + ' ...';
      default:
        metavars = buildMetavar(action.nargs as number);
        return metavars.join(' ');
    }
  }

  #splitLines(text: string, width: number): string[] {
    const lines: string[] = [];

    text = text.replace(/[\n\|\t]/g, ' ');

    text = text.trim();
    text = text.replace(WHITESPACE_REGEXP, ' ');

    // Wraps the text into lines of at most "width" characters, preferably after a delimiter. Note that the
    // original implementation treats the index of a missing delimiter as NaN; this port preserves that behavior.
    for (const line of text.split(EOL)) {
      if (width >= line.length) {
        lines.push(line);
        continue;
      }

      let wrapStart: number = 0;
      let wrapEnd: number = width;
      let delimiterIndex: number = 0;
      while (wrapEnd <= line.length) {
        if (wrapEnd !== line.length) {
          delimiterIndex = (SPLIT_LINES_DELIMITER_REGEXP.exec(line.substring(wrapStart, wrapEnd)) || { index: NaN })
            .index;
          wrapEnd = wrapStart + delimiterIndex + 1;
        }
        lines.push(line.substring(wrapStart, wrapEnd));
        wrapStart = wrapEnd;
        wrapEnd += width;
      }
      if (wrapStart < line.length) {
        lines.push(line.substring(wrapStart, wrapEnd));
      }
    }

    return lines;
  }

  #fillText(text: string, width: number, indent: string): string {
    const lines: string[] = this.#splitLines(text, width).map((line: string) => indent + line);
    return lines.join(EOL);
  }
}

/**
 * Equivalent to argparse's `ArgumentParser.formatHelp()`.
 */
export function formatHelp(parser: IHelpParser): string {
  const formatter: HelpFormatter = new HelpFormatter(parser.prog);

  // usage
  formatter.addUsage(parser.actions);

  // description
  formatter.addText(parser.description);

  // positionals, optionals and user-defined groups
  for (const group of parser.groups) {
    formatter.startSection(group.title);
    formatter.addArguments(group.actions);
    formatter.endSection();
  }

  // epilog
  formatter.addText(parser.epilog);

  // determine help from format above
  return formatter.formatHelp();
}

/**
 * Equivalent to argparse's `ArgumentParser.formatUsage()`.
 */
export function formatUsage(parser: IHelpParser): string {
  const formatter: HelpFormatter = new HelpFormatter(parser.prog);
  formatter.addUsage(parser.actions);
  return formatter.formatHelp();
}
