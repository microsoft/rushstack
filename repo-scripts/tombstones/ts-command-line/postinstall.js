
function writeErrorInRed(message) {
  console.error('');
  console.error('\u001b[31m' + message + '\u001b[39m');
}

writeErrorInRed(
`* * * * * * * * * * * * * THIS PACKAGE WAS RENAMED! * * * * * * * * * * * * * *`);

console.error(`
IMPORTANT: This package has moved under the "@rushstack" NPM scope.

OLD NAME: @microsoft/ts-command-line (4.3.10)
NEW NAME: @rushstack/ts-command-line (4.3.11)

The new package's CHANGELOG.md preserves version history from before the rename.
The new package starts with a SemVer PATCH increment, since no code has changed.
To learn about the Rush Stack project, please visit https://rushstack.io/`
);

writeErrorInRed(
`* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *`);
