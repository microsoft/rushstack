import * as os from 'os';
import * as colors from 'colors';
import { RushConfiguration, Utilities } from '@microsoft/rush-lib';

export default class GitPolicy {
  public static check(rushConfiguration: RushConfiguration): boolean {
    if (rushConfiguration.gitAllowedEmailPatterns.length === 0) {
      return true;
    }

    // Determine the user's account
    // Ex: "file:C:/Users/Bob/.gitconfig        bob@example.com"
    const output: string = Utilities.executeCommandAndCaptureOutput('git',
      ['config', '--show-origin', 'user.email'], '.');

    const parts: string[] = output.split('\t');

    if (parts.length !== 2) {
      throw new Error('The gitPolicy check failed because "git config" returned unexpected output:'
        + os.EOL + '"' + output + '"');
    }

    // Ex: "file:C:/Users/Bob/.gitconfig"
    const userEmailSource: string = parts[0].trim();
    // Ex: "bob@example.com"
    const userEmail: string = parts[1].trim();

    for (const pattern of rushConfiguration.gitAllowedEmailPatterns) {
      const regex: RegExp = new RegExp('^' + pattern + '$', 'i');
      if (userEmail.match(regex)) {
        // We are cool
        console.log(`${userEmail} matched pattern: "${pattern}"`);
        return;
      }
    }

    let message: string = 'Uh oh!  To keep things tidy, this repository asks that you submit'
      + ' your Git commmits using an e-mail like ';
    if (rushConfiguration.gitAllowedEmailPatterns.length > 1) {
      message += 'one of these patterns:';
    } else {
      message += 'this pattern:';
    }

    message += os.EOL + os.EOL + rushConfiguration.gitAllowedEmailPatterns
      .map(
        (x: string) => '    ' + colors.cyan(x)
      ).join(os.EOL);

    message += os.EOL + os.EOL + '...but yours looks like this:'
      + os.EOL + os.EOL + '    Address: '
      + colors.cyan(`"${userEmail}"`)
      + os.EOL + '    Source: '
      + colors.cyan(userEmailSource);

    message += os.EOL + os.EOL + 'To change it, you can use these commands:' + os.EOL + os.EOL
      + colors.cyan('    git config --local user.name "John Doe"') + os.EOL
      + colors.cyan('    git config --local user.email john@example.com') + os.EOL;

    console.log(message);

    console.log(colors.red('Aborting, so you can go fix the problem.'));

    return false;
  }
}
