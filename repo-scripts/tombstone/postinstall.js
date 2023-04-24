function writeErrorInRed(message) {
  console.error('');
  console.error('\u001b[31m' + message + '\u001b[39m');
}

writeErrorInRed(`* * * * * * * * * * * * * THIS PACKAGE WAS DEPRECATED! * * * * * * * * * * * * * *`);

console.error(`
@rushstack/localization-plugin has been renamed to @rushstack/webpack4-localization-plugin.`);

writeErrorInRed(`* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *\n`);

process.exit(1);
