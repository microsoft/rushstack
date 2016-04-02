import {
  GulpTask
} from 'gulp-core-build';

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

  public executeTask(gulp, completeCallback): any {
    let gulpConnect = require('gulp-connect');
    let compression = require('compression');
    let gutil = require('gulp-util');
    let open = require('gulp-open');
    let path = require('path');
    let openBrowser = (process.argv.indexOf('--nobrowser') === -1);
    let portArgumentIndex = process.argv.indexOf('--port');
    let { port, initialPage, api } = this.taskConfig;
    let { rootPath } = this.buildConfig;

    if (portArgumentIndex >= 0 && process.argv.length > (portArgumentIndex + 1)) {
      port = Number(process.argv[portArgumentIndex + 1]);
    }

    // Spin up the connect server
    gulpConnect.server({
      livereload: true,
      middleware: function(connectInstance, opt) {
        return [
          compression(),
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

        let express = require('express');
        let app = express();

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

function logRequestsMiddleware(req, res, next) {
  let { colors } = require('gulp-util');
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
        `${ req.ip ? `[${ colors.cyan(req.ip) }] ` : `` }`,
        `'${ resourceColor(req.url) }'`
      ].join(''));
  }

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
