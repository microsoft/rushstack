import * as os from 'os';
import * as colors from 'colors';
import { RushConfiguration, Utilities } from '@microsoft/rush-lib';

export default class GitPolicy {
  public static check(rushConfiguration: RushConfiguration): boolean {
    if (rushConfiguration.gitAllowedEmailPatterns.length === 0) {
      return true;
    }

    console.log('Checking Git policy for this repository.' + os.EOL);

    // Determine the user's account
    // Ex: "file:C:/Users/Bob/.gitconfig        bob@example.com"
    let output: string;
    try {
      output = Utilities.executeCommandAndCaptureOutput('git',
        ['config', '--show-origin', 'user.email'], '.');
    } catch (e) {
      console.log(
`Error: ${e.message}
Unable to determine your Git configuration using this command:

    git config --show-origin user.email

If you didn't configure your e-mail yet, try something like this:`);

      console.log(colors.cyan(
`
    git config --local user.name "Mr. Example"
    git config --local user.email "${rushConfiguration.gitSampleEmail}"
`));

      console.log(colors.red('Aborting, so you can go fix your settings.  (Or use --bypass-policy to skip.)'));

      return false;
    }

    const parts: string[] = output.split('\t');
    if (parts.length !== 2) {
      throw new Error('The gitPolicy check failed because "git config" returned unexpected output:'
        + os.EOL + `"${output}"`);
    }

    // Ex: "file:C:/Users/Bob/.gitconfig"
    const userEmailSource: string = parts[0].trim();
    // Ex: "bob@example.com"
    const userEmail: string = parts[1].trim();

    for (const pattern of rushConfiguration.gitAllowedEmailPatterns) {
      const regex: RegExp = new RegExp('^' + pattern + '$', 'i');
      if (userEmail.match(regex)) {
        // For debugging:
        // console.log(`${userEmail} matched pattern: "${pattern}"`);
        return true;
      }
    }

    let message: string = 'Hey there!  To keep things tidy, this repo asks you '
      + 'to submit your Git commmits using an e-mail like ';
    if (rushConfiguration.gitAllowedEmailPatterns.length > 1) {
      message += 'one of these patterns:';
    } else {
      message += 'this pattern:';
    }
    console.log(message + os.EOL);

    for (const pattern of  rushConfiguration.gitAllowedEmailPatterns) {
      console.log('    ' + colors.cyan(pattern));
    }

    console.log(
`
...but yours is configured like this:

    ` + colors.cyan(`"${userEmail}"`) + `

(The setting came from here: ${userEmailSource})

To fix it, you can use commands like this:`);

    console.log(colors.cyan(
`
    git config --local user.name "Mr. Example"
    git config --local user.email "${rushConfiguration.gitSampleEmail}"
`));

    console.log(colors.red('Aborting, so you can go fix your settings.  (Or use --bypass-policy to skip.)'));
    return false;
  }
}
