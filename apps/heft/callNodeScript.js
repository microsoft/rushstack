'use strict';

const child_process = require('child_process');

exports.callNodeScript = function callNodeScript(scriptPath, args = [], options = {}) {
  child_process.execSync(`node ${scriptPath} ${args.join(' ')}`, {
    stdio: 'inherit',
    cwd: __dirname,
    ...options
  });
};
