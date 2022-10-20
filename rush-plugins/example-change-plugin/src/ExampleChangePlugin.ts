// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IRushPlugin,
  RushSession,
  RushConfiguration,
  ChangeExperiencePromptModule
} from '@rushstack/rush-sdk';

const PLUGIN_NAME: string = 'ExampleChangePlugin';

async function _promptForJiraTicket(promptModule: ChangeExperiencePromptModule): Promise<string | undefined> {
  const { jiraTicket }: { jiraTicket: string } = await promptModule({
    name: 'jiraTicket',
    type: 'input',
    message: 'Enter JIRA Ticket, or N/A if none:',
    validate: (input: string) => {
      if (input === 'N/A') {
        return true;
      } else if (input.match(/^[a-zA-Z]+-[0-9]+$/)) {
        return true;
      } else {
        return 'Enter a JIRA ticket in the form PRJ-NNNN, or N/A if you do not have a JIRA ticket.';
      }
    }
  });

  if (jiraTicket === 'N/A') return undefined;
  return jiraTicket.toUpperCase();
}

/**
 * @public
 */
export class ExampleChangePlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.registerChangeExperienceProviderFactory(PLUGIN_NAME, () => {
        return {
          promptForCustomFields: async (
            promptModule: ChangeExperiencePromptModule,
            packageName: string
          ): Promise<Record<string, string | undefined>> => {
            const jiraTicket: string | undefined = await _promptForJiraTicket(promptModule);

            return {
              jiraTicket: jiraTicket
            };
          }
        };
      });
    });
  }
}
