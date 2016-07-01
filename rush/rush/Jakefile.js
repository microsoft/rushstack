var child_process = require('child_process');
var fs = require('fs');
var path = require('path')

function execSync(command) {
  // For Mac/Windows portability, use path.normalize() to select
  // slashes or backslashes for the command (but not its parameters)
  var parts = command.split(' ');
  parts[0] = path.normalize(parts[0]);
  var normalizedCommand = parts.join(' ');

  var options = {
    stdio: [0, 1, 2] // (omit this to suppress console output)
  };
  console.log('\nExecuting: ' + normalizedCommand);
  child_process.execSync(normalizedCommand, options, function () {
    complete();
  });
}

// Extract the input file list from tsconfig.json
var tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
var tsFiles = tsconfig['files'];
var sourceDeps = ['tsconfig.json'].concat(tsFiles);
// console.log('sourceDeps = ' + sourceDeps);

desc('Default task');
task('default', ['build'], function (params) {
}, false);

desc('Build everything');
task('build', ['lib/rush.js', 'lib/rush-schema.json', 'lib/tslint.txt'], function (params) {
  console.log('\nFINISHED TASK: build');
}, false);

desc('Run tsc');
file('lib/rush.js', sourceDeps, function () {
  execSync('node_modules/.bin/tsc');

  console.log('\nFINISHED TASK: tsc');
}, false);

desc('Run tslint');
file('lib/tslint.txt', sourceDeps, function () {
    execSync('node_modules/.bin/tslint '
      + '-r node_modules/tslint-microsoft-contrib '
      + tsFiles.join(' '));

    fs.writeFileSync('lib/tslint.txt', 'Done');

    console.log('\nFINISHED TASK: tslint');
}, false);

desc('Copy rush-schema.json');
file('lib/rush-schema.json', ['src/rush-schema.json'], function () {
    jake.cpR('src/rush-schema.json', 'lib/');
    console.log('\nFINISHED TASK: rush-schema.json');
}, false);

desc('Clean all built files');
task('clean', [], function (params) {
  execSync('node_modules/.bin/rimraf lib/');
  console.log('\nFINISHED TASK: clean');
}, false);
