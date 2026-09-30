// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Models of the argparse objects that its HelpFormatter reads. See HelpFormatter.ts, which is loaded only when
// help text is actually rendered.

export const SUPPRESS: '==SUPPRESS==' = '==SUPPRESS==';
export const OPTIONAL: '?' = '?';
export const ZERO_OR_MORE: '*' = '*';
export const ONE_OR_MORE: '+' = '+';
export const PARSER: 'A...' = 'A...';
export const REMAINDER: '...' = '...';

/**
 * The properties of an argparse `Action` that the help formatter reads.
 */
export interface IHelpAction {
  readonly optionStrings: ReadonlyArray<string>;
  readonly dest: string;
  readonly nargs?: number | string;
  readonly metavar?: string;
  readonly help?: string;
  readonly choices?: ReadonlyArray<string> | Record<string, unknown>;
  readonly required?: boolean;
  readonly subactions?: ReadonlyArray<IHelpAction>;
}

/**
 * The properties of an argparse `ArgumentGroup` that the help formatter reads.
 */
export interface IHelpActionGroup {
  readonly title: string;
  readonly actions: ReadonlyArray<IHelpAction>;
}

/**
 * The properties of an argparse `ArgumentParser` that are needed to render its help.
 */
export interface IHelpParser {
  readonly prog: string;
  readonly description: string | undefined;
  readonly epilog: string | undefined;
  /**
   * All actions, in the order in which they were added to the parser.
   */
  readonly actions: ReadonlyArray<IHelpAction>;
  /**
   * The action groups, in the order in which they were created.
   */
  readonly groups: ReadonlyArray<IHelpActionGroup>;
}

/**
 * The help action that argparse adds to every parser.
 */
export const HELP_ACTION: IHelpAction = {
  optionStrings: ['-h', '--help'],
  dest: SUPPRESS,
  nargs: 0,
  help: 'Show this help message and exit.'
};
