// slice(2) trims away "node.exe" and "build.js" from the array
console.log('build.js: ARGS=' + JSON.stringify(process.argv.slice(2)));
