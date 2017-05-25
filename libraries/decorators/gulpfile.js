'use strict';

let build = require('@ms/sp-build-internal-web');

build.initialize(require('gulp'));
build.rig.configureOnPremBuild("../../tools/vsts-deploy/app-min/on-prem");
