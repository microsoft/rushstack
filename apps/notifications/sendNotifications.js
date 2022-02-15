const execSync = require('child_process').execSync;
const { JsonFile } = require('@rushstack/node-core-library');

const notificationResponse = execSync(
  'git cat-file blob refs/remotes/origin/zhas/cli-notification:common/config/notifications/notifications.json'
);

const notificationJson = JSON.parse(notificationResponse.toString('utf-8'));
const currentDate = new Date();
notificationJson.notifications.forEach((annoucement) => {
  // if time stamp is undefined, it means this is a new announcement
  if (annoucement.timeStamp === undefined) {
    const expirationDate = setExpirationDate(currentDate, 3);
    annoucement.timeStamp = expirationDate.toISOString();
  } else {
    // check if the announcement is expired, we remove it from queue
    if (new Date(annoucement.timeStamp).getTime() < currentDate.getTime()) {
      notificationJson.notifications.pop();
    }
  }
});

JsonFile.save(notificationJson, '../../common/config/notifications/notifications.json', {
  updateExistingFile: true
});

function setExpirationDate(date, days) {
  var expirationDate = new Date(date);
  expirationDate.setDate(expirationDate.getDate() + days);
  return expirationDate;
}
