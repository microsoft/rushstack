import { AddNotifications } from './AddNotifications';

const parser: AddNotifications = new AddNotifications();

parser.addNotification().catch((err: Error) => {
  console.log(err);
});
