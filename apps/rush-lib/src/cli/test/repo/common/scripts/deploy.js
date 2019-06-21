console.log('Executing common/scripts/deploy.js');
console.log('ARGV: ' + JSON.stringify(process.argv));
console.log('CWD: ' + process.cwd());
console.log('INITCWD: ' + process.env['INIT_CWD']);

process.exit(123)
