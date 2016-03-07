var gutil = require('gulp-util');
function log() {
    var messages = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        messages[_i - 0] = arguments[_i];
    }
    gutil.log(messages.join(' '));
}
exports.log = log;
function logError() {
    var messages = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        messages[_i - 0] = arguments[_i];
    }
    gutil.log('Error: ' + gutil.colors.red(messages.join(' ')));
}
exports.logError = logError;
