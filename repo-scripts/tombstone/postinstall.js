function writeErrorInRed(message) {
  console.error('');
  console.error('\u001b[31m' + message + '\u001b[39m');
}

writeErrorInRed(`* * * * * * * * * * * * * THIS PACKAGE WAS DEPRECATED! * * * * * * * * * * * * * *`);

console.error(`
@microsoft/rush-buildxl has been deprecated in favor of BuildXL's built-in Rush frontend.

See here: https://github.com/microsoft/BuildXL/blob/master/Documentation/Wiki/Frontends/rush-onboarding.md`);

writeErrorInRed(`* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *\n`);

process.exit(1);
