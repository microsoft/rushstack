/// <reference path="../../typings/tsd" />

import { IServeOptions } from '../options/serve';
let chalk = require('chalk');

export default class BundleTasks { // implements ITaskGroup {

  public static registerTasks(build: any, options: IServeOptions) {
    let gulp = build.gulp;
    let connect = require('gulp-connect');
    let open = require('gulp-open');
    let path = require('path');
    let openBrowser = (process.argv.indexOf('--nobrowser') === -1);
    let port = options.port;

    let portArgumentIndex = process.argv.indexOf('--port');

    if (portArgumentIndex >= 0 && process.argv.length > (portArgumentIndex + 1)) {
      port = Number(process.argv[portArgumentIndex + 1]);
    }

    build.task('serve-reload', ['bundle'], () => {
      gulp.src('')
        .pipe(connect.reload());
    });

    build.task('serve', ['bundle-watch'], () => {

      connect.server({
        root: build.rootDir,
        port: port,
        livereload: true,
        middleware: function(connectInstance, opt) {
          return [
            require('connect').compress(),
            logRequestsMiddleware,
            enableCorsMiddleware
          ];
        }
      });

      // If an api is provided, spin it up.
      if (options.api) {
        let apiMap;

        try {
          apiMap = require(path.join(build.rootDir, options.api.entryPath));

          if (apiMap && apiMap.default) {
            apiMap = apiMap.default;
          }
        } catch (e) {

          build.logError(`The api entry could not be loaded: ${ options.api.entryPath }`);
        }

        if (apiMap) {
          console.log(`Starting api server on port ${ options.api.port }.`);

          let express = require('express');
          let app = express();

          app.use(logRequestsMiddleware);
          app.use(enableCorsMiddleware);
          app.use(setJSONResponseContentTypeMiddleware);

          // Load the apis.
          for (let api in apiMap) {
            if (apiMap.hasOwnProperty(api)) {
              console.log(`Registring api: ${ chalk.green(api) }`);
              app.get(api, apiMap[api]);
            }
          }
          app.listen(options.api.port || 5432);
        }
      }

      // Spin up the browser.
      if (openBrowser) {
        let uri = 'http://localhost:' + port + options.initialPage;

        gulp.src('')
          .pipe(open({
            uri: uri
          }));
      }

    });
  }
}

function logRequestsMiddleware(req, res, next) {
  let resourceColor = chalk.cyan;

  if (req.url.indexOf('.bundle.js') >= 0) {
    resourceColor = chalk.green;
  } else if (req.url.indexOf('.js') >= 0) {
    resourceColor = chalk.magenta;
  }

  console.log('  Request: \'' + resourceColor(req.url) + '\'');
  next();
}

function enableCorsMiddleware(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}

function setJSONResponseContentTypeMiddleware(req, res, next) {
  res.setHeader('content-type', 'application/json');
  next();
}
