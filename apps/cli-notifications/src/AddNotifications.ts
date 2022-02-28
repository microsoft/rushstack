import { JsonFile } from '@rushstack/node-core-library';
import * as inquirer from 'inquirer';
import { IAnswers, IAnnouncement, INotificationJson } from './configurations';

export class AddNotifications {
  public constructor() {}

  public async addNotification(configFilePath: string): Promise<void> {
    await inquirer
      .prompt([
        {
          type: 'input',
          input: '',
          name: 'message',
          message: 'Provide the full text of the announcement to be displayed'
        },
        {
          type: 'input',
          input: 1,
          name: 'duration',
          message: 'Provide the days for announcement to last'
        }
      ])
      .then((answers: IAnswers) => {
        const notificationJson: INotificationJson = JsonFile.load(configFilePath);
        const notifications: IAnnouncement[] = notificationJson.notifications;

        // insert new notification
        const currentDate: Date = new Date();
        const announcement: IAnnouncement = {
          message: answers.message,
          expiration: this._setExpirationDate(currentDate, answers.duration).toISOString()
        };
        notifications.splice(notifications.length, 0, announcement);

        JsonFile.save(notificationJson, configFilePath, {
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
