// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';

import { RushConfiguration } from '../api/RushConfiguration';
import { Utilities } from '../utilities/Utilities';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';

export class GitPolicy {
  public static getUserEmail(rushConfiguration: RushConfiguration, bypassPolicy: boolean): string {
    // Determine the user's account
    // Ex: "bob@example.com"
    let userEmail: string;
    try {
      userEmail = Utilities.executeCommandAndCaptureOutput('git',
        ['config', 'user.email'], '.').trim();
    } catch (e) {
      console.log(
`Error: ${e.message}
Unable to determine your Git configuration using this command:

    git config user.email

If you didn't configure your e-mail yet, try something like this:`);

      console.log(colors.cyan(
`
    git config --local user.name "Mr. Example"
    git config --local user.email "${rushConfiguration.gitSampleEmail || 'example@contoso.com'}"
`));

      console.log(colors.red('Aborting, so you can go fix your settings.  (Or use --bypass-policy to skip.)'));

      throw new AlreadyReportedError();
    }

    // sanity check; a valid e-mail should not contain any whitespace
    // if this fails, then we have another issue to report
    if (userEmail && userEmail.match(/^\S+$/g)) {
      if (bypassPolicy) {
        return userEmail;
      }

      console.log('Checking Git policy for this repository.' + os.EOL);

      if (rushConfiguration.gitAllowedEmailRegExps.length === 0) {
        return userEmail;
      }

      for (const pattern of rushConfiguration.gitAllowedEmailRegExps) {
        const regex: RegExp = new RegExp('^' + pattern + '$', 'i');
        if (userEmail.match(regex)) {
          return userEmail;
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

    let message: string = 'Hey there!  To keep things tidy, this repo asks you '
    + 'to submit your Git commmits using an e-mail like ';
    if (rushConfiguration.gitAllowedEmailRegExps.length > 1) {
      message += 'one of these patterns:';
    } else {
      message += 'this pattern:';
    }
    console.log(message + os.EOL);

    for (const pattern of  rushConfiguration.gitAllowedEmailRegExps) {
      console.log('    ' + colors.cyan(pattern));
    }

    console.log([
      '',
      '...but yours is configured like this:',
      '',
      '    ' + fancyEmail,
      '',
      'To fix it, you can use commands like this:',
      '',
      colors.cyan('    git config --local user.name "Mr. Example"'),
      colors.cyan(`    git config --local user.email "${rushConfiguration.gitSampleEmail}"`),
      ''
    ].join(os.EOL));

    console.log(colors.red('Aborting, so you can go fix your settings.  (Or use --bypass-policy to skip.)'));
    throw new AlreadyReportedError();
  }
}
