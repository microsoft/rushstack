let gutil = require('gulp-util');

export function log(...messages: string[]) {
  gutil.log(messages.join(' '));
}

export function logError(...messages: string[]) {
  gutil.log('Error: ' + gutil.colors.red(messages.join(' ')));
}

export function logStartSubtask(taskName: string) {
  if (taskName) {
    log(`Starting subtask '${ gutil.colors.cyan(taskName) }'...`);
  }
}

export function logEndSubtask(taskName: string, duration: number, errorMessage?: string) {
  let durationString = (duration < 1000) ? (duration + ' ms') : ((Math.round(duration / 10) / 100) + ' s');

  if (taskName) {
    if (!errorMessage) {
      log(`Finished subtask '${ gutil.colors.cyan(taskName)}' after ${ gutil.colors.magenta( durationString )}`);
    } else {
      log(`[${ gutil.colors.cyan(taskName)}] ${gutil.colors.red('error')} ${ errorMessage }`);
    }
  }
}
