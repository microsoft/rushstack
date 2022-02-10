const execSync = require('child_process').execSync;

execSync('git cat-file blob refs/remotes/origin/main:common/config/notifications/notifications.json');
