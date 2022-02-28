import { displayNotifications } from './DisplayNotifications';

displayNotifications({
  sourceBranch: 'refs/remotes/origin/zhas/cli-notification',
  configFilePath: 'common/config/notifications/notifications.json'
});
// 'git cat-file blob refs/remotes/origin/zhas/cli-notification:common/config/notifications/notifications.json'
