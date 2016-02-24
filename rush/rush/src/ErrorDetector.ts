// Example: "[22:50:27] [gulp-tslint] error blah/test.ts[84, 20]: syntax error"
// 0: input
// 1: "[22:50:27]"
// 2: "[gulp-tslint]"
// 3: "error"
// 4: "blah/test.ts"
// 5: "84, 20"
// 6: "syntax error"
export let lintRegex = new RegExp('^(\\[[^\\]]+\\]) *(\\[[^\\]]+\\]) *([^ ]+) *([^[]+) *\\[([^\\]]+)\\]: *(.*)');

// Example: "Error: TypeScript error: src\test.ts(68,6): error TS2304: Cannot find name 'x'."
// 0: input
// 1: "src\test.ts"
// 2: "(68,6):"
// 3: "error TS2304: Cannot find name 'x'."
export let tscRegex = new RegExp('^Error: TypeScript error: ([^\\(]+) *([^:]+:) *(.*)');

// Example: "       × This Test Failed"
export let testRegex = new RegExp(' *× (\\D.*)');