// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DynamicCommandLineParser } from '../providers/DynamicCommandLineParser.ts';
import { DynamicCommandLineAction } from '../providers/DynamicCommandLineAction.ts';
import type { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter.ts';
import { ensureHelpTextMatchesSnapshot } from './helpTestUtilities.ts';

describe(DynamicCommandLineParser.name, () => {
  it('parses an action', async () => {
    const commandLineParser: DynamicCommandLineParser = new DynamicCommandLineParser({
      toolFilename: 'example',
      toolDescription: 'An example project'
    });

    const action: DynamicCommandLineAction = new DynamicCommandLineAction({
      actionName: 'do:the-job',
      summary: 'does the job',
      documentation: 'a longer description'
    });
    commandLineParser.addAction(action);
    action.defineFlagParameter({
      parameterLongName: '--flag',
      description: 'The flag'
    });

    ensureHelpTextMatchesSnapshot(commandLineParser);

    await commandLineParser.executeAsync(['do:the-job', '--flag']);

    expect(commandLineParser.selectedAction).toEqual(action);

    const retrievedParameter: CommandLineFlagParameter = action.getFlagParameter('--flag');
    expect(retrievedParameter.value).toBe(true);
  });
});
