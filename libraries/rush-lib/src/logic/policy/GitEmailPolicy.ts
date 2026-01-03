// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration';
import { Utilities } from '../../utilities/Utilities';
import { Git } from '../Git';
import { RushConstants } from '../RushConstants';
import type { IPolicyValidatorOptions } from './PolicyValidator';

export async function validateAsync(
  rushConfiguration: RushConfiguration,
  options: IPolicyValidatorOptions
): Promise<void> {
  const git: Git = new Git(rushConfiguration);

  if (!git.isGitPresent()) {
    // If Git isn't installed, or this Rush project is not under a Git working folder,
    // then we don't care about the Git email
    // eslint-disable-next-line no-console
    console.log(
      Colorize.cyan('Ignoring Git validation because the Git binary was not found in the shell path.') + '\n'
    );
    return;
  }

  if (!git.isPathUnderGitWorkingTree()) {
    // If Git isn't installed, or this Rush project is not under a Git working folder,
    // then we don't care about the Git email
    // eslint-disable-next-line no-console
    console.log(Colorize.cyan('Ignoring Git validation because this is not a Git working folder.') + '\n');
    return;
  }

  let userEmail: string | undefined = await git.tryGetGitEmailAsync();
  // If there isn't a Git policy, then we don't care whether the person configured
  // a Git email address at all.
  if (rushConfiguration.gitAllowedEmailRegExps.length === 0) {
    if (userEmail === undefined) {
      return;
    }

    // Otherwise, if an email *is* configured at all, then we still perform the basic
    // sanity checks (e.g. no spaces in the address).
  }

  try {
    userEmail = git.validateGitEmail(userEmail);

    // sanity check; a valid email should not contain any whitespace
    // if this fails, then we have another issue to report
    if (!userEmail.match(/^\S+$/g)) {
      // eslint-disable-next-line no-console
      console.log(
        [
          Colorize.red('Your Git email address is invalid: ' + JSON.stringify(userEmail)),
          '',
          `To configure your Git email address, try something like this:`,
          '',
          ...getEmailExampleLines(rushConfiguration),
          ''
        ].join('\n')
      );
      throw new AlreadyReportedError();
    }
  } catch (e) {
    if (e instanceof AlreadyReportedError) {
      let errorMessage: string = 'Aborting, so you can go fix your settings.';
      if (options.bypassPolicyAllowed) {
        errorMessage += ` (Or use "${RushConstants.bypassPolicyFlagLongName}" to skip.)`;
      }

      // eslint-disable-next-line no-console
      console.log(Colorize.red(errorMessage));
      throw e;
    } else {
      throw e;
    }
  }

  if (rushConfiguration.gitAllowedEmailRegExps.length === 0) {
    // If there is no policy, then we're good
    return;
  }

  // eslint-disable-next-line no-console
  console.log('Checking Git policy for this repository.\n');

  // If there is a policy, at least one of the RegExp's must match
  for (const pattern of rushConfiguration.gitAllowedEmailRegExps) {
    const regex: RegExp = new RegExp(`^${pattern}$`, 'i');
    if (userEmail.match(regex)) {
      return;
    }
  }

  // Show the user's name as well.
  // Ex. "Example Name <name@example.com>"
  let fancyEmail: string = Colorize.cyan(userEmail);
  try {
    const userName: string = (
      await Utilities.executeCommandAndCaptureOutputAsync({
        command: git.gitPath!,
        args: ['config', 'user.name'],
        workingDirectory: '.'
      })
    ).trim();
    if (userName) {
      fancyEmail = `${userName} <${fancyEmail}>`;
    }
  } catch (e) {
    // but if it fails, this isn't critical, so don't bother them about it
  }

  // eslint-disable-next-line no-console
  console.log(
    [
      'Hey there!  To keep things tidy, this repo asks you to submit your Git commits using an email like ' +
        (rushConfiguration.gitAllowedEmailRegExps.length > 1 ? 'one of these patterns:' : 'this pattern:'),
      '',
      ...rushConfiguration.gitAllowedEmailRegExps.map((pattern) => '    ' + Colorize.cyan(pattern)),
      '',
      '...but yours is configured like this:',
      '',
      `    ${fancyEmail}`,
      '',
      'To fix it, you can use commands like this:',
      '',
      ...getEmailExampleLines(rushConfiguration),
      ''
    ].join('\n')
  );

  let errorMessage: string = 'Aborting, so you can go fix your settings.';
  if (options.bypassPolicyAllowed) {
    errorMessage += ` (Or use "${RushConstants.bypassPolicyFlagLongName}" to skip.)`;
  }

  // eslint-disable-next-line no-console
  console.log(Colorize.red(errorMessage));
  throw new AlreadyReportedError();
}

export function getEmailExampleLines(rushConfiguration: RushConfiguration): string[] {
  return [
    Colorize.cyan('    git config --local user.name "Example Name"'),
    Colorize.cyan(
      `    git config --local user.email "${rushConfiguration.gitSampleEmail || 'name@example.com'}"`
    )
  ];
}
