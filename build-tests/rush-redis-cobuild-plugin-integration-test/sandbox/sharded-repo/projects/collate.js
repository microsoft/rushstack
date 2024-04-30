/* eslint-env es6 */
const path = require('path');
const { FileSystem } = require('@rushstack/node-core-library');

if (!process.env.RUSH_SHARD_PARENT_FOLDER) {
  console.error('no RUSH_SHARD_PARENT_FOLDER');
  process.exit(1);
}

if (!process.env.RUSH_SHARD_COUNT) {
  console.error('no RUSH_SHARD_COUNT');
  process.exit(1);
}

setTimeout(() => {
  const parentFolder = process.env.RUSH_SHARD_PARENT_FOLDER;
  const shards = +process.env.RUSH_SHARD_COUNT;
  let output = '';
  for (let i = 1; i <= shards; i++) {
    const outputFolder = path.resolve(parentFolder, `${i}`);
    const outputFile = path.resolve(outputFolder, 'output.txt');
    FileSystem.ensureFolder(outputFolder);
    output += FileSystem.readFile(outputFile, 'utf-8');
    output += '\n';
  }
  const finalOutputFolder = path.resolve('coverage');
  const outputFile = path.resolve(finalOutputFolder, 'output.txt');
  FileSystem.ensureFolder(finalOutputFolder);
  FileSystem.writeFile(outputFile, output);
}, 500);