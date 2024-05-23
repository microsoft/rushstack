/* eslint-env es6 */
const path = require('path');
const { FileSystem, Async } = require('@rushstack/node-core-library');

async function runAsync() {
  await Async.sleepAsync(500);

  const outputFolder = path.resolve(process.cwd(), 'dist');
  const outputFile = path.resolve(outputFolder, 'pre-build');
  FileSystem.writeFile(outputFile, `Hello world!`, { ensureFolderExists: true });
  console.log('done');
}

void runAsync().catch((err) => {
  console.warn(err);
  process.exit(1);
});
