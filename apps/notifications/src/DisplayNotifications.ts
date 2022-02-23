import { ConsoleTerminalProvider, Terminal, Executable } from '@rushstack/node-core-library';
import { SpawnSyncReturns } from 'child_process';
import { IAnswers, INotificationJson } from './configurations';

// the branch will be changed to main once pr is in
const spawnResult: SpawnSyncReturns<string> = Executable.spawnSync(
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

const notificationJson: INotificationJson = JSON.parse(spawnResult.stdout);
const notifications: IAnswers[] = notificationJson.notifications;

// for display
const terminal: Terminal = new Terminal(new ConsoleTerminalProvider());
const currentDate: Date = new Date();
terminal.writeLine(`=====================================`);

notifications.forEach((announcement) => {
  // check if the announcement is expired, we only display the unexpired ones
  if (new Date(announcement.expiration).getTime() > currentDate.getTime()) {
    terminal.writeLine(`${announcement.message}`);
  }
});

terminal.writeLine(`=====================================`);
