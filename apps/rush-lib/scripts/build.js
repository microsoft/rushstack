const path = require('path');
const colors = require('colors/safe');
const { FileSystem, Executable } = require('@rushstack/node-core-library');

// Borrowed from api-extractor/src/generators/ApiReportGenerator.ts
function areEquivalentApiFileContents(actualFileContent, expectedFileContent) {
  // NOTE: "\s" also matches "\r" and "\n"
  const normalizedActual = actualFileContent.replace(/[\s]+/g, ' ');
  const normalizedExpected = expectedFileContent.replace(/[\s]+/g, ' ');
  return normalizedActual === normalizedExpected;
}

function main() {
  process.exitCode = 1;

  // Do the normal build
  const result = Executable.spawnSync('heft', ['test', '--clean'], { stdio: 'inherit' });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status;
    return;
  }

  // As a post-process, copy "rush-lib.d.ts" into the "rush-sdk" workspace folder
  const sourceFilePath = path.join(__dirname, '../dist/rush-lib.d.ts');
  const targetFilePath = require.resolve('@rushstack/rush-sdk/dist/rush-lib.d.ts');

  const sourceFileContent = FileSystem.readFile(sourceFilePath);
  const targetFileContent = FileSystem.readFile(targetFilePath);

  if (areEquivalentApiFileContents(targetFileContent, sourceFileContent)) {
    console.error('The "rush-sdk" definitions are up to date.');
    process.exitCode = 0;
  } else {
    if (process.argv.indexOf('--production') >= 0) {
      console.error(colors.red('ERROR: The "rush-sdk/dist/rush-lib.d.ts" definitions are out of date'));
      console.error('');
      console.error(
        colors.red('To fix this, build the project locally and commit the updated file to your Git branch.\n')
      );
      return;
    } else {
      console.error(colors.yellow('The "rush-sdk" definitions are out of date.\n'));
      console.error(colors.green('Updating: ') + targetFilePath);
      FileSystem.copyFile({
        sourcePath: sourceFilePath,
        destinationPath: targetFilePath
      });
      console.error(
        colors.yellow(`\nPlease commit the updated file to your Git branch and include it with your PR.`)
      );
      process.exitCode = 0;
    }
  }
}

main();
