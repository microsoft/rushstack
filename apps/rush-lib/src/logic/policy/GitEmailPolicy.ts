// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';

import { RushConfiguration } from '../../api/RushConfiguration';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';
import { Utilities } from '../../utilities/Utilities';
import { Git } from '../Git';

export class GitEmailPolicy {
  public static validate(rushConfiguration: RushConfiguration): void {
    if (!Git.isGitPresent()) {
      // If Git isn't installed, or this Rush project is not under a Git working folder,
      // then we don't care about the Git email
      console.log(colors.cyan(
        'Ignoring Git validation because the Git binary was not found in the shell path.') + os.EOL);
      return;
    }

    if (!Git.isPathUnderGitWorkingTree()) {
      // If Git isn't installed, or this Rush project is not under a Git working folder,
      // then we don't care about the Git email
      console.log(colors.cyan(
        'Ignoring Git validation because this is not a Git working folder.' + os.EOL));
      return;
    }

    // If there isn't a Git policy, then we don't care whether the person configured
    // a Git email address at all.  This helps people who don't
    if (rushConfiguration.gitAllowedEmailRegExps.length === 0) {
      if (Git.tryGetGitEmail(rushConfiguration) === undefined) {
        return;
      }

      // Otherwise, if an email *is* configured at all, then we still perform the basic
      // sanity checks (e.g. no spaces in the address).
    }

    let userEmail: string;
    try {
      userEmail = Git.getGitEmail(rushConfiguration);

      // sanity check; a valid email should not contain any whitespace
      // if this fails, then we have another issue to report
      if (!userEmail.match(/^\S+$/g)) {
        console.log([
          colors.red('Your Git email address is invalid: ' + JSON.stringify(userEmail)),
          '',
          `To configure your Git email address, try something like this:`,
          '',
          ...GitEmailPolicy.getEmailExampleLines(rushConfiguration),
          ''
        ].join(os.EOL));
        throw new AlreadyReportedError();
      }
    } catch (e) {
      if (e instanceof AlreadyReportedError) {
        console.log(colors.red('Aborting, so you can go fix your settings.  (Or use --bypass-policy to skip.)'));
        throw e;
      } else {
        throw e;
      }
    }

    if (rushConfiguration.gitAllowedEmailRegExps.length === 0) {
      // If there is no policy, then we're good
      return;
    }

    console.log('Checking Git policy for this repository.' + os.EOL);

    // If there is a policy, at least one of the RegExp's must match
    for (const pattern of rushConfiguration.gitAllowedEmailRegExps) {
      const regex: RegExp = new RegExp(`^${pattern}$`, 'i');
      if (userEmail.match(regex)) {
        return;
      }
    }

    // Show the user's name as well.
    // Ex. "Mr. Example <mr@example.com>"
    let fancyEmail: string = colors.cyan(userEmail);
    const gitPath: string = Git.getGitPath()!;
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
