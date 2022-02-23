const { ConsoleTerminalProvider, Encoding, FileSystem, Terminal } = require('@rushstack/node-core-library');

const pathToNotificationJson = 'common/config/notifications/notifications.json';
const result = FileSystem.readFile(pathToNotificationJson, { encoding: Encoding.Utf8 });
const notificationJson = JSON.parse(result);
const notifications = notificationJson.notifications;
// for display
const terminal = new Terminal(new ConsoleTerminalProvider());
const currentDate = new Date();
terminal.writeLine(`=====================================`);

notifications.forEach((announcement) => {
  // check if the announcement is expired, we only display the unexpired ones
  if (new Date(announcement.timeStamp).getTime() > currentDate.getTime()) {
    terminal.writeLine(`${announcement.message}`);
  }
});

terminal.writeLine(`=====================================`);
