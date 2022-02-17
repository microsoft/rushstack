const { ConsoleTerminalProvider, Terminal, Executable } = require('@rushstack/node-core-library');
const inquirer = require('inquirer');
const execSync = require('child_process').execSync;

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
    // insert the new announcement to the config
    const notificationJson = JSON.parse(spawnResult.stdout);
    const currentDate = new Date();
    console.log(notificationJson);
    let notifications = notificationJson.notifications;

    notifications.splice(notifications.length, 0, answers);

    // notificationJson.notifications.forEach((announcement) => {
    //   // if time stamp is undefined, it means this is a new announcement
    //   if (announcement.timeStamp === undefined) {
    //     const expirationDate = setExpirationDate(currentDate, 3);
    //     announcement.timeStamp = expirationDate.toISOString();
    //   } else {
    //     // check if the announcement is expired, we remove it from queue
    //     if (new Date(announcement.timeStamp).getTime() < currentDate.getTime()) {
    //       notificationJson.notifications.splice(index, 1);
    //     }
    //   }
    //   index++;
    // });
  });

// const terminal = new Terminal(new ConsoleTerminalProvider());
// terminal.writeLine(`=====================================`);

// notificationJson.notifications.forEach((announcement) => {
//   terminal.writeLine(`${announcement.message}`);
// });

// terminal.writeLine(`=====================================`);

// JsonFile.save(notificationJson, 'common/config/notifications/notifications.json', {
//   updateExistingFile: true
// });

function setExpirationDate(date, days) {
  var expirationDate = new Date(date);
  expirationDate.setDate(expirationDate.getDate() + days);
  return expirationDate;
}
