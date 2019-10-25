
function writeErrorInRed(message) {
  console.error('');
  console.error('\u001b[31m' + message + '\u001b[39m');
}

writeErrorInRed(`* * * * * * * * * * * THIS PACKAGE HAS BEEN DEPRECATED! * * * * * * * * * * * *`);

console.error(`
OLD NAME:  @microsoft/eslint-config-scalable-ts
NEW NAME:  @rushstack/eslint-config

Please uninstall the old package by running this command:

  npm uninstall --save-dev @microsoft/eslint-config-scalable-ts

Then install the new package:

  npm install --save-dev @rushstack/eslint-config`);

writeErrorInRed(`* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *`);
