/// <reference path="../../typings/tsd" />

export default class DefaultTasks {

  public static registerTasks(build: any) {
    build.task('default', ['build']);
  }
}
