import { GulpTask } from 'gulp-core-build';
import { IBuildConfig } from 'gulp-core-build/lib/IBuildConfig';
import gulp = require('gulp');
import http = require('http');
import * as pathType from 'path';
import * as gUtilType from 'gulp-util';
import * as expressType from 'express';

export interface IServeTaskConfig {
  api?: {
    port: number,
    entryPath: string
  };
  initialPage: string;
  port: number;
}

interface IApiMap {
  [ route: string ]: Function;
}

export class ServeTask extends GulpTask<IServeTaskConfig> {
  public name: string = 'serve';

  public taskConfig: IServeTaskConfig = {
    api: undefined,
    initialPage: '/index.html',
    port: 4321
  };

  public executeTask(gulp: gulp.Gulp, completeCallback?: (error?: string) => void): void {
    /* tslint:disable:typedef */
    const gulpConnect = require('gulp-connect');
    const open = require('gulp-open');
    /* tslint:enable:typedef */
    const gutil: typeof gUtilType = require('gulp-util');
    const path: typeof pathType = require('path');
    const openBrowser: boolean = (process.argv.indexOf('--nobrowser') === -1);
    const portArgumentIndex: number = process.argv.indexOf('--port');
    let { port, initialPage, api }: IServeTaskConfig = this.taskConfig;
    const { rootPath }: IBuildConfig = this.buildConfig;

    if (portArgumentIndex >= 0 && process.argv.length > (portArgumentIndex + 1)) {
      port = Number(process.argv[portArgumentIndex + 1]);
    }

    // Spin up the connect server
    gulpConnect.server({
      livereload: true,
      middleware: (): Function[] => [logRequestsMiddleware, enableCorsMiddleware],
      port: port,
      root: rootPath
    });

    // If an api is provided, spin it up.
    if (api) {
      let apiMap: IApiMap | { default: IApiMap };

      try {
        apiMap = require(path.join(rootPath, api.entryPath));

        if (apiMap && (apiMap as { default: IApiMap }).default) {
          apiMap = (apiMap as { default: IApiMap }).default;
        }
      } catch (e) {
        this.logError(`The api entry could not be loaded: ${api.entryPath}`);
      }

      if (apiMap) {
        console.log(`Starting api server on port ${api.port}.`);

        const express: typeof expressType = require('express');
        const app: expressType.Express = express();

        app.use(logRequestsMiddleware);
        app.use(enableCorsMiddleware);
        app.use(setJSONResponseContentTypeMiddleware);

        // Load the apis.
        for (const apiMapEntry in apiMap) {
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
      let uri: string = initialPage;
      if (initialPage.match(/^https?:\/\//)) {
        if (initialPage.match(/^\//)) {
          initialPage = `/${initialPage}`;
        }

        uri = `http://localhost:${port}${initialPage}`;
      }

      gulp.src('')
        .pipe(open({
          uri: uri
        }));
    }

    completeCallback();
  }
}

function logRequestsMiddleware(req: http.IncomingMessage, res: http.ServerResponse, next?: () => void): void {
  const { colors }: typeof gUtilType = require('gulp-util');
  /* tslint:disable:no-any */
  const ipAddress: string = (req as any).ip;
  /* tslint:enable:no-any */
  let resourceColor: Chalk.ChalkChain = colors.cyan;

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

function enableCorsMiddleware(req: http.IncomingMessage, res: http.ServerResponse, next?: () => void): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}

function setJSONResponseContentTypeMiddleware(req: http.IncomingMessage,
                                              res: http.ServerResponse,
                                              next?: () => void): void {
  res.setHeader('content-type', 'application/json');
  next();
}
