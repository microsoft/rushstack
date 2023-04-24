import * as httpProxy from 'http-proxy';
import * as http from 'http';

const proxy: httpProxy = httpProxy.createProxyServer({});

const hasFailed: { [k: string]: boolean } = {};

let requestCount: number = 0;
const server: http.Server = http.createServer((req, res) => {
  requestCount += 1;

  if (req.url && requestCount % 2 === 0 && !hasFailed[req.url]) {
    console.log('failing', req.url);
    hasFailed[req.url] = true;
    res.statusCode = 500;
    res.end();
    return;
  } else if (req.url) {
    console.log('proxying', req.url);
  }

  proxy.web(req, res, {
    target: 'http://127.0.0.1:9000'
  });
});

server.listen(9002);
