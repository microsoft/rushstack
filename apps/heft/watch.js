'use strict';

const path = require('path');
const { ToolPaths } = require('@microsoft/rush-stack-compiler-3.7');
const { callNodeScript } = require('./callNodeScript');

callNodeScript(path.resolve(ToolPaths.typescriptPackagePath, 'bin', 'tsc'), ['--watch']);
