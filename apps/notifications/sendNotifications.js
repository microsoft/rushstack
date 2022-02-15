const execSync = require('child_process').execSync;
const { JsonFile } = require('@rushstack/node-core-library');

const notificationResponse = execSync(
  'git cat-file blob refs/remotes/origin/zhas/cli-notification:common/config/notifications/notifications.json'
);

const notificationJson = JSON.parse(notificationResponse.toString('utf-8'));
notificationJson.notifications.forEach((annoucement) => {
  annoucement.timeStamp = new Date().toISOString();
});

JsonFile.save(notificationJson, '../../common/config/notifications/notifications.json', {
  updateExistingFile: true
});

function setExpirationDate(date, days) {
  var expirationDate = new Date(date);
  expirationDate.setDate(result.getDate() + days);
  return expirationDate;
}
