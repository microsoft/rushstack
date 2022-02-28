import { displayNotifications } from './DisplayNotifications';
import { AddNotifications } from './AddNotifications';
import * as path from 'path';

/*
Example of writing a wrapper class to display notifications
*/
displayNotifications({
  sourceBranch: 'refs/remotes/origin/zhas/cli-notification',
  configFilePath: 'common/config/notifications/notifications.json'
});

/*
Example of writing a wrapper class to add a notification
*/
const parser: AddNotifications = new AddNotifications();

const configPath: string = path.join(
  process.cwd(),
  '..',
  '..',
  'common/config/notifications/notifications.json'
);
parser.addNotification(configPath).catch((err: Error) => {
  console.log(err);
});
