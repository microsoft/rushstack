// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { GitPolicy } from './GitPolicy';
import { RushConfiguration } from '../../api/RushConfiguration';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { Utilities } from '../../utilities/Utilities';

interface IResultOrError<TResult> {
  error?: Error;
  result?: TResult;
}

export class GitEmailPolicy extends GitPolicy {
  public static getUserEmail(rushConfiguration: RushConfiguration): string {
    // Determine the user's account
    // Ex: "bob@example.com"
    const emailResult: IResultOrError<string> = GitEmailPolicy.tryGetEmail();
    if (emailResult.error) {
      console.log(
        [
          `Error: ${emailResult.error.message}`,
          'Unable to determine your Git configuration using this command:',
          '',
          '    git config user.email',
          '',
          `If you didn't configure your e-mail yet, try something like this:`,
          ...GitEmailPolicy.getEmailExampleLines(rushConfiguration)
        ].join(os.EOL)
      );
      throw new AlreadyReportedError();
    }

    return emailResult.result || '';
  }

  private static tryGetEmail(): IResultOrError<string> {
    try {
      return {
        result: Utilities.executeCommandAndCaptureOutput(
          'git',
          ['config', 'user.email'],
          '.'
        ).trim()
      };
    } catch (e) {
      return {
        error: e
      };
    }
  }

  private static getEmailExampleLines(rushConfiguration: RushConfiguration): string[] {
    return [
      colors.cyan('    git config --local user.name "Mr. Example"'),
      colors.cyan(`    git config --local user.email "${rushConfiguration.gitSampleEmail || 'example@contoso.com'}"`)
    ];
  }

  protected innerValidate(gitPath: string, rushConfiguration: RushConfiguration ): void {
    const userEmail: string = GitEmailPolicy.getUserEmail(rushConfiguration);
    if (!userEmail) {
      console.log(colors.red('Aborting, so you can go fix your settings.  (Or use --bypass-policy to skip.)'));
      throw new AlreadyReportedError();
    }

        // sanity check; a valid e-mail should not contain any whitespace
    // if this fails, then we have another issue to report
    if (userEmail && userEmail.match(/^\S+$/g)) {
       console.log('Checking Git policy for this repository.' + os.EOL);

      if (rushConfiguration.gitAllowedEmailRegExps.length === 0) {
        return;
      }

      for (const pattern of rushConfiguration.gitAllowedEmailRegExps) {
        const regex: RegExp = new RegExp('^' + pattern + '$', 'i');
        if (userEmail.match(regex)) {
          return;
        }
      }
    }

    // Show the user's name as well.
    // Ex. "Mr. Example <mr@example.com>"
    let fancyEmail: string = colors.cyan(userEmail);
    try {
      const userName: string = Utilities.executeCommandAndCaptureOutput('git',
        ['config', 'user.name'], '.').trim();
      if (userName) {
        fancyEmail = `${userName} <${fancyEmail}>`;
      }
    } catch (e) {
      // but if it fails, this isn't critical, so don't bother them about it
    }

    debugger;
    console.log([
      'Hey there!  To keep things tidy, this repo asks you to submit your Git commits using an e-mail like ',
      rushConfiguration.gitAllowedEmailRegExps.length > 1 ? 'one of these patterns:' : 'this pattern:',
      '',
      ...rushConfiguration.gitAllowedEmailRegExps.map((pattern) => '    ' + colors.cyan(pattern)),
      '',
      '...but yours is configured like this:',
      '',
      `    ${fancyEmail}`,
      '',
      'To fix it, you can use commands like this:',
      '',
      ...GitEmailPolicy.getEmailExampleLines(rushConfiguration),
      ''
    ].join(os.EOL));

    console.log(colors.red('Aborting, so you can go fix your settings.  (Or use --bypass-policy to skip.)'));
    throw new AlreadyReportedError();
  }
}
