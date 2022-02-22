const { ConsoleTerminalProvider, Terminal } = require('@rushstack/node-core-library');
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

// for display
const terminal = new Terminal(new ConsoleTerminalProvider());
terminal.writeLine(`=====================================`);

notifications.forEach((announcement) => {
  // check if the announcement is expired, we only display the unexpired ones
  if (new Date(announcement.timeStamp).getTime() > currentDate.getTime()) {
    terminal.writeLine(`${announcement.message}`);
  }
});

terminal.writeLine(`=====================================`);
