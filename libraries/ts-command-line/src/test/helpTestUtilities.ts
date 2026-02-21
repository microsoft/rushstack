// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AnsiEscape } from '@rushstack/terminal';

import type { CommandLineParser } from '../providers/CommandLineParser.ts';

export function ensureHelpTextMatchesSnapshot(parser: CommandLineParser): void {
  const globalHelpText: string = AnsiEscape.formatForTests(parser.renderHelpText());
  expect(globalHelpText).toMatchSnapshot('global help');

  for (const action of parser.actions) {
    const actionHelpText: string = AnsiEscape.formatForTests(action.renderHelpText());
    expect(actionHelpText).toMatchSnapshot(action.actionName);
  }
}
