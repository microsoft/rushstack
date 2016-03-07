let gutil = require('gulp-util');

export function log(...messages: string[]) {
  gutil.log(messages.join(' '));
}

export function logError(...messages: string[]) {
  gutil.log('Error: ' + gutil.colors.red(messages.join(' ')));
}
