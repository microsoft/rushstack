import * as assert from 'assert';

import DefaultClass from './dist/scenario-class';
import defaultFunctionDeclaration from './dist/scenario-functiondeclaration';
import defaultFunctionStatement from './dist/scenario-functionstatement';
import defaultLiteral from './dist/scenario-literal';

assert(typeof DefaultClass === 'function');
assert(typeof defaultFunctionDeclaration === 'function');
assert(typeof defaultFunctionStatement === 'function');
assert(typeof defaultLiteral === 'string');

assert((DefaultClass as any).name === 'DefaultClass');
assert((defaultFunctionDeclaration as any).name === 'defaultFunctionDeclaration');
assert((defaultFunctionStatement as any).name === 'defaultFunctionStatement');
assert(defaultLiteral === 'literal');
