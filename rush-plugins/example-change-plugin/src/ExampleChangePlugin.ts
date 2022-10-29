// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import type {
  IRushPlugin,
  RushSession,
  RushConfiguration,
  ChangeExperiencePromptModule,
  IChangeExperienceProvider,
  IChangeFile
} from '@rushstack/rush-sdk';
import {
  ChangeType
} from '@rushstack/rush-sdk';

const PLUGIN_NAME: string = 'ExampleChangePlugin';

interface IConventional {
  message: string;
  jiraTicket?: string;
  type?: string;
}

export class ExampleChangeProvider implements IChangeExperienceProvider {
  public readonly rushSession: RushSession;
  public readonly rushConfig: RushConfiguration;

  constructor(rushSession: RushSession, rushConfig: RushConfiguration) {
    this.rushSession = rushSession;
    this.rushConfig = rushConfig;
  }

  async promptForCustomFields(promptModule: ChangeExperiencePromptModule, packageName: string): Promise<Record<string, string | undefined>> {
    const jiraTicket: string | undefined = await this._promptForJiraTicket(promptModule);

    return {
      jiraTicket: jiraTicket
    };
  }

  async _promptForJiraTicket(promptModule: ChangeExperiencePromptModule): Promise<string | undefined> {
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

  async _getCommitMessage(changeFileData: Map<string, IChangeFile>, commitChangeMessage: string | undefined): Promise<string | undefined> {
    // If the user already provided a message, we don't mess with it
    if (commitChangeMessage) {
      return commitChangeMessage;
    }

    // If we have change data we can use, we construct a message
    for (const data of changeFileData.values()) {
      for (const change of data.changes) {
        let message: string = ExampleChangeProvider.bumpTypeToConventional(change.changeType!);
        message = message + ': ';

        if (change.customFields?.jiraTicket) {
          message += change.customFields.jiraTicket + ' ';
        }

        message += change.comment;

        return message;
      }
    }

    // We don't care, let the change module use a default
    return undefined;
  }

  static getLatestCommit(): string | undefined {
    const lines: string[] = child_process.execSync(`git log --since '1 hour ago' --format="%s"`).toString().split('\n');

    return this.filterCommits(lines)[0];
  }

  static filterCommits(commits: string[]): string[] {
    return commits.filter(line => {
      if (line.match(/^Merge/)) return false;
      if (line.match(/\[skip ci\]/)) return false;
      return true;
    });
  }

  static parseCommitMessage(message: string): IConventional {
    let parsedMessage: string = message;
    let parsedType: string | undefined = undefined;
    let parsedTicket: string | undefined = undefined;


    const matchedType = parsedMessage.match(/([a-zA-Z]+!?): ?(.+)/);
    if (matchedType) {
      parsedType = matchedType[1];
      parsedMessage = matchedType[2];
    }

    const matchedTicket = parsedMessage.match(/([A-Z]+-\d+)[^a-zA-Z]+(.+)/);
    if (matchedTicket) {
      parsedTicket = matchedTicket[1];
      parsedMessage = matchedTicket[2];
    }

    parsedMessage = parsedMessage.replace(/BREAKING CHANGE:?/, '').trim();

    return { type: parsedType, message: parsedMessage, jiraTicket: parsedTicket };
  }

  static conventionalToBumpType(type: string): ChangeType {
    if (type.endsWith('!')) {
      // A conventional commit type ending with '!' is generally a breaking change,
      // but in a monorepo environment we are still aren't going to default to "major" -
      // the user will have to select it specifically for a given project.
      type = type.slice(0, -1);
    }

    switch (type) {
      case 'docs':
      case 'test':
      case 'chore':
      case 'refactor':
        return ChangeType.none;
      case 'fix':
      case 'perf':
        return ChangeType.patch;
      case 'feat':
        return ChangeType.minor;
      default:
        return ChangeType.patch;
    }
  }

  static bumpTypeToConventional(bumpType: ChangeType): string {
    switch (bumpType) {
      case ChangeType.none:
        return 'chore';
      case ChangeType.patch:
        return 'fix';
      case ChangeType.minor:
        return 'feat';
      case ChangeType.major:
        return 'feat!';
      default:
        return 'chore';
    }
  }
}

/**
 * @public
 */
export class ExampleChangePlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.registerChangeExperienceProviderFactory(PLUGIN_NAME, () => {
        return new ExampleChangeProvider(rushSession, rushConfig);
      });
    });
  }
}
