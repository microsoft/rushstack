const { JsonFile, Executable } = require('@rushstack/node-core-library');
const inquirer = require('inquirer');

inquirer
  .prompt([
    {
      type: 'input',
      name: 'message',
      message: 'Provide the full text of the announcement to be displayed'
    }
  ])
  .then((answers) => {
    // the branch will be changed to main once pr is in
    const spawnResult = Executable.spawnSync(
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

    const notificationJson = JSON.parse(spawnResult.stdout);
    let notifications = notificationJson.notifications;

    // insert new notification
    const currentDate = new Date();
    answers.timeStamp = setExpirationDate(currentDate, 3).toISOString();
    notifications.splice(notifications.length, 0, answers);

    JsonFile.save(notificationJson, '../../common/config/notifications/notifications.json', {
      updateExistingFile: true
    });
  });

function setExpirationDate(date, days) {
  var expirationDate = new Date(date);
  expirationDate.setDate(expirationDate.getDate() + days);
  return expirationDate;
}
