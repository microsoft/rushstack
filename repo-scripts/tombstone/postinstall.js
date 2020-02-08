
function writeErrorInRed(message) {
  console.error('');
  console.error('\u001b[31m' + message + '\u001b[39m');
}

writeErrorInRed(`* * * * * * * * * * * THIS PACKAGE HAS BEEN DEPRECATED! * * * * * * * * * * * *`);

console.error(`
This package has been deprecated in favor of @microsoft/set-webpack-public-path-plugin`
);

writeErrorInRed(`* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *`);
