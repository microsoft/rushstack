import * as os from 'os';
import { RushConfiguration, Utilities } from '@microsoft/rush-lib';

export default class GitPolicy {
  public static check(rushConfiguration: RushConfiguration): void {
    if (rushConfiguration.gitAllowedEmailPatterns.length === 0) {
      return;
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

    console.log('Bad=' + userEmail);
  }
}
