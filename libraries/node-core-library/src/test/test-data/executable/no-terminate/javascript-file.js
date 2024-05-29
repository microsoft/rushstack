const [node, script, ...args] = process.argv;
console.log(`Executing no-terminate with args: ${args.join(' ')}`);

console.error('This process never terminates');

const readline = require('readline');
const readlineInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

async function runAsync() {
  for await (const line of readlineInterface) {
    console.log(line);
  }
}

runAsync();
