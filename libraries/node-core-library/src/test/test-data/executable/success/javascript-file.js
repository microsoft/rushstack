console.log('Executing javascript-file.js with args:');

// Print the command line arguments:
console.log(JSON.stringify(process.argv));

setTimeout(() => { console.log('done'); }, 15000, 'funky');