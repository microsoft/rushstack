var logging_1 = require('./logging');
var chalk = require('chalk');
var GulpTask = (function () {
    function GulpTask() {
        this.name = 'unnamed gulp task';
    }
    GulpTask.prototype.executeTask = function (gulp, completeCallback) {
        throw 'The task subclass is missing the "executeTask" method.';
    };
    GulpTask.prototype.execute = function (config) {
        var _this = this;
        this.buildConfig = config;
        if (this.name) {
            logging_1.log("Starting subtask '" + chalk.cyan(this.name) + "'...");
        }
        return new Promise(function (resolve, reject) {
            var stream;
            try {
                stream = _this.executeTask(_this.buildConfig.gulp, function (result) {
                    if (!result) {
                        resolve();
                    }
                    else {
                        reject(result);
                    }
                });
            }
            catch (e) {
                console.log("The task " + _this.name + " threw an exception: " + e);
                reject(e);
            }
            if (stream) {
                stream
                    .on('error', function (error) {
                    reject(error);
                })
                    .on('end', function () {
                    debugger;
                    resolve();
                });
            }
        });
    };
    GulpTask.prototype.resolvePath = function (localPath) {
        var path = require('path');
        return path.resolve(path.join(this.buildConfig.rootPath, localPath));
    };
    GulpTask.prototype.readConfig = function (localPath) {
        var fullPath = this.resolvePath(localPath);
        var result = null;
        var fs = require('fs');
        try {
            var content = fs.readFileSync(fullPath, 'utf8');
            result = JSON.parse(content);
        }
        catch (e) { }
        return result;
    };
    return GulpTask;
})();
exports.GulpTask = GulpTask;
