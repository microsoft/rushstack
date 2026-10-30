const fs = require('node:fs');
const name = require('./package.json').name;
fs.appendFileSync('../runs.txt', name + '\n');
console.log('building-' + name);
setTimeout(() => console.log('finished-' + name), 150);
