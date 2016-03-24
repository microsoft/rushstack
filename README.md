# gulp-core-build-serve
`gulp-core-build-serve` is a plugin for `gulp-core-build` which introduces the ability to serve files from a directory using `gulp-connect` and `express`. 

# Tasks
## ServeTask

### Description

### Config
```typescript
interface IServeTaskConfig {
  api?: {
    port: number,
    entryPath: string
  };
  initialPage: string;
  port: number;
}
```
* **

Usage (and defaults):
```typescript
build.webpack.setConfig({
    api: null,
    initialPage: '/index.html',
    port: 4321
  }
);
```
