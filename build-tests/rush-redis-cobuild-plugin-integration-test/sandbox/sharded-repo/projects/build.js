/* eslint-env es6 */
const path = require('path');
const { FileSystem } = require('@rushstack/node-core-library');

const args = process.argv.slice(2);

console.log('start', args.join(' '));
const shardIndex = args.findIndex((e) => e.includes('--shard'));
const shard = shardIndex >= 0 ? args[shardIndex].replace('--shard=', '') : undefined;
console.log(shard);
setTimeout(() => {
  const outputFolder = shard
    ? path.resolve(process.cwd(), '.shard', `shard-${shard.split('/')[0]}`)
    : path.resolve(process.cwd(), 'dist');
  const outputFile = path.resolve(outputFolder, 'output.txt');
  FileSystem.ensureFolder(outputFolder);
  FileSystem.writeFile(outputFile, `Hello world! ${args.join(' ')}`);
  console.log('done');
}, 10000);
