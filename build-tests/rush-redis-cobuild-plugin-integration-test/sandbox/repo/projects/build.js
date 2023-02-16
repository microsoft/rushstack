/* eslint-env es6 */
const path = require('path');
const { FileSystem } = require('@rushstack/node-core-library');

console.log('start');
setTimeout(() => {
  const outputFolder = path.resolve(process.cwd(), 'dist');
  const outputFile = path.resolve(outputFolder, 'output.txt');
  FileSystem.ensureFolder(outputFolder);
  FileSystem.writeFile(outputFile, 'Hello world!');
  console.log('done');
}, 5000);
