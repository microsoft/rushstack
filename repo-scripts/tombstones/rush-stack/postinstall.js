
function writeErrorInRed(message) {
  console.error('');
  console.error('\u001b[31m' + message + '\u001b[39m');
}

writeErrorInRed(
`* * * * * * * * * * * * * THIS PACKAGE WAS RENAMED! * * * * * * * * * * * * * *`);

console.error(`
The "@microsoft/rush-stack" package has been retired.  It was an early
prototype of a tool chain that has since evolved into an entire family of
projects under the "Rush Stack" umbrella.

But there's good news:  Rush Stack is going strong!

To learn more, please visit https://rushstack.io/`
);

writeErrorInRed(
`* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *\n`);

process.exit(1);
