const execSync = require('child_process').execSync;
const { JsonFile } = require('@rushstack/node-core-library');

const notificationResponse = execSync(
  'git cat-file blob refs/remotes/origin/zhas/cli-notification:common/config/notifications/notifications.json'
);

const notificationJson = JSON.parse(notificationResponse.toString('utf-8'));
const currentDate = new Date();
let index = 0;
notificationJson.notifications.forEach((announcement) => {
  // if time stamp is undefined, it means this is a new announcement
  if (announcement.timeStamp === undefined) {
    const expirationDate = setExpirationDate(currentDate, 3);
    announcement.timeStamp = expirationDate.toISOString();
  } else {
    // check if the announcement is expired, we remove it from queue
    if (new Date(announcement.timeStamp).getTime() < currentDate.getTime()) {
      notificationJson.notifications.splice(index);
    }
  }
  index++;
});

JsonFile.save(notificationJson, '../../common/config/notifications/notifications.json', {
  updateExistingFile: true
});

function setExpirationDate(date, days) {
  var expirationDate = new Date(date);
  expirationDate.setDate(expirationDate.getDate() + days);
  return expirationDate;
}
