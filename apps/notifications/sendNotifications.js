const execSync = require('child_process').execSync;

const notificationResponse = execSync(
  'git cat-file blob refs/remotes/origin/zhas/cli-notification:common/config/notifications/notifications.json'
);

const notificationJson = JSON.parse(notificationResponse.toString('utf-8'));
notificationJson.notifications.forEach((annoucement) => {
  annoucement.timeStamp = new Date().toISOString();
});
console.log(notificationJson.notifications);
