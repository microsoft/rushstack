
function writeErrorInRed(message) {
  console.error('');
  console.error('\u001b[31m' + message + '\u001b[39m');
}

writeErrorInRed(
`* * * * * * * * * * * * * THIS PACKAGE IS DEPRECATED! * * * * * * * * * * * * *`);

console.error(`
The "@microsoft/resolve-chunk-plugin" package has been retired.

It is no longer developed or supported.  Please do not use it.

For better alternatives, please visit https://rushstack.io/ for help.`
);

writeErrorInRed(
`* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *\n`);

process.exit(1);
