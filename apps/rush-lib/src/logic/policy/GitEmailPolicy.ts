// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { RushConfiguration } from '../../api/RushConfiguration';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { Utilities } from '../../utilities/Utilities';
import { Git } from '../Git';

export class GitEmailPolicy {
  public static validate(rushConfiguration: RushConfiguration ): void {
    const gitPath: string | undefined = Git.getGitPath();
    if (!gitPath) {
      // Git isn't present, so the git policy doesn't apply
      return;
    }

    let userEmail: string;
    try {
      userEmail = Git.getGitEmail(rushConfiguration);
    } catch (e) {
      if (e instanceof AlreadyReportedError) {
        console.log(colors.red('Aborting, so you can go fix your settings.  (Or use --bypass-policy to skip.)'));
        throw e;
      } else {
        console.log(colors.red(`An unexpected error occurred: ${e}`));
        throw e;
      }
    }

    console.log('Checking Git policy for this repository.' + os.EOL);

    // sanity check; a valid email should not contain any whitespace
    // if this fails, then we have another issue to report
    if (userEmail.match(/^\S+$/g)) {
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
      const userName: string = Utilities.executeCommandAndCaptureOutput(
        gitPath,
        ['config', 'user.name'],
        '.'
      ).trim();
      if (userName) {
        fancyEmail = `${userName} <${fancyEmail}>`;
      }
    } catch (e) {
      // but if it fails, this isn't critical, so don't bother them about it
    }

    console.log([
      'Hey there!  To keep things tidy, this repo asks you to submit your Git commits using an email like ' +
        (rushConfiguration.gitAllowedEmailRegExps.length > 1 ? 'one of these patterns:' : 'this pattern:'),
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

  public static getEmailExampleLines(rushConfiguration: RushConfiguration): string[] {
    return [
      colors.cyan('    git config --local user.name "Mr. Example"'),
      colors.cyan(`    git config --local user.email "${rushConfiguration.gitSampleEmail || 'example@contoso.com'}"`)
    ];
  }
}
