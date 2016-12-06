require('@microsoft/sp-loader/lib/FrameworkPolyfills');

var context = require.context('.', true, /.+\.test\.js?$/);

context.keys().forEach(context);

module.exports = context;
