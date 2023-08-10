/* eslint-env es6 */
const path = require('path');
const { FileSystem } = require('@rushstack/node-core-library');

const args = process.argv.slice(2);

console.log('start', args.join(' '));
setTimeout(() => {
  const outputFolder = path.resolve(process.cwd(), 'dist');
  const outputFile = path.resolve(outputFolder, 'output.txt');
  FileSystem.ensureFolder(outputFolder);
  FileSystem.writeFile(outputFile, `Hello world! ${args.join(' ')}`);
  console.log('done');
}, 2000);
