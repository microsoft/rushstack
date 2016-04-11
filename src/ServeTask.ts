import {
  GulpTask
} from 'gulp-core-build';
import gulp = require('gulp');
import http = require('http');

export interface IServeTaskConfig {
  api?: {
    port: number,
    entryPath: string
  };
  initialPage: string;
  port: number;
}

export class ServeTask extends GulpTask<IServeTaskConfig> {
  public name = 'serve';

  public taskConfig: IServeTaskConfig = {
    api: null,
    initialPage: '/index.html',
    port: 4321
  };

  public executeTask(
    gulp: gulp.Gulp,
    completeCallback?: (result?: any) => void
  ): Promise<any> | NodeJS.ReadWriteStream | void {

    const gulpConnect = require('gulp-connect');
    const gutil = require('gulp-util');
    const open = require('gulp-open');
    const path = require('path');
    const openBrowser = (process.argv.indexOf('--nobrowser') === -1);
    const portArgumentIndex = process.argv.indexOf('--port');
    let { port, initialPage, api } = this.taskConfig;
    const { rootPath } = this.buildConfig;

    if (portArgumentIndex >= 0 && process.argv.length > (portArgumentIndex + 1)) {
      port = Number(process.argv[portArgumentIndex + 1]);
    }

    // Spin up the connect server
    gulpConnect.server({
      livereload: true,
      middleware: function() {
        return [
          logRequestsMiddleware,
          enableCorsMiddleware
        ];
      },
      port: port,
      root: rootPath
    });

    // If an api is provided, spin it up.
    if (api) {
      let apiMap;

      try {
        apiMap = require(path.join(rootPath, api.entryPath));

        if (apiMap && apiMap.default) {
          apiMap = apiMap.default;
        }
      } catch (e) {
        this.logError(`The api entry could not be loaded: ${api.entryPath}`);
      }

      if (apiMap) {
        console.log(`Starting api server on port ${api.port}.`);

        const express = require('express');
        const app = express();

        app.use(logRequestsMiddleware);
        app.use(enableCorsMiddleware);
        app.use(setJSONResponseContentTypeMiddleware);

        // Load the apis.
        for (let apiMapEntry in apiMap) {
          if (apiMap.hasOwnProperty(apiMapEntry)) {
            console.log(`Registring api: ${ gutil.colors.green(apiMapEntry) }`);
            app.get(apiMapEntry, apiMap[apiMapEntry]);
          }
        }
        app.listen(api.port || 5432);
      }
    }

    // Spin up the browser.
    if (openBrowser) {
      let uri = 'http://localhost:' + port + initialPage;

      gulp.src('')
        .pipe(open({
          uri: uri
        }));
    }

    completeCallback();
  }
}

function logRequestsMiddleware(req: http.IncomingMessage, res: http.ServerResponse, next?: () => any) {
  const { colors } = require('gulp-util');
  const ipAddress = (req as any).ip;
  let resourceColor = colors.cyan;

  if (req && req.url) {
    if (req.url.indexOf('.bundle.js') >= 0) {
      resourceColor = colors.green;
    } else if (req.url.indexOf('.js') >= 0) {
      resourceColor = colors.magenta;
    }

    console.log(
      [
        `  Request: `,
        `${ ipAddress ? `[${ colors.cyan(ipAddress) }] ` : `` }`,
        `'${ resourceColor(req.url) }'`
      ].join(''));
  }

  next();
}

function enableCorsMiddleware(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next?: () => any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}

function setJSONResponseContentTypeMiddleware(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next?: () => any) {
  res.setHeader('content-type', 'application/json');
  next();
}
