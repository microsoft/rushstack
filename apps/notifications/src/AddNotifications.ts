import { JsonFile } from '@rushstack/node-core-library';
import * as inquirer from 'inquirer';
import * as path from 'path';
import { IAnswers, INotificationJson } from './configurations';

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
        const pathToJson: string = path.join(
          process.cwd(),
          '..',
          '..',
          'common/config/notifications/notifications.json'
        );
        const notificationJson: INotificationJson = JsonFile.load(pathToJson);
        const notifications: IAnswers[] = notificationJson.notifications;

        // insert new notification
        const currentDate: Date = new Date();
        answers.expiration = this._setExpirationDate(currentDate, 3).toISOString();
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
