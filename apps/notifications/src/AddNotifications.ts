import { JsonFile, Executable } from '@rushstack/node-core-library';
import * as inquirer from 'inquirer';
import { SpawnSyncReturns } from 'child_process';

export interface IAnswers {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export class AddNotifications {
  public constructor() {}

  public async addNotification(): Promise<void> {
    await inquirer
      .prompt([
        {
          type: 'input',
          input: '',

          name: 'message',
          message: 'Provide the full text of the announcement to be displayed'
        }
      ])
      .then((answers: IAnswers) => {
        // the branch will be changed to main once pr is in
        const spawnResult: SpawnSyncReturns<string> = Executable.spawnSync(
          'git',
          [
            'cat-file',
            'blob',
            'refs/remotes/origin/zhas/cli-notification:common/config/notifications/notifications.json'
          ],
          {
            currentWorkingDirectory: process.cwd()
          }
        );

        if (spawnResult.status !== 0) {
          throw new Error(`git cat-file exited with status ${spawnResult.status}: ${spawnResult.stderr}`);
        }

        const notificationJson: IAnswers = JSON.parse(spawnResult.stdout);
        const notifications: IAnswers[] = notificationJson.notifications;

        // insert new notification
        const currentDate: Date = new Date();
        answers.timeStamp = this._setExpirationDate(currentDate, 3).toISOString();
        notifications.splice(notifications.length, 0, answers);

        JsonFile.save(notificationJson, '../../common/config/notifications/notifications.json', {
          updateExistingFile: true
        });
      });
  }

  private _setExpirationDate(date: Date, days: number): Date {
    const expirationDate: Date = new Date(date);
    expirationDate.setDate(expirationDate.getDate() + days);
    return expirationDate;
  }
}
