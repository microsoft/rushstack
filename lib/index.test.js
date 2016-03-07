'use strict';
require('es6-promise');
var _a = require('mocha'), describe = _a.describe, it = _a.it;
var expect = require('chai').expect;
var _b = require('./index'), serial = _b.serial, parallel = _b.parallel;
describe('serial', function () {
    it('can run a set of tasks in serial', function (done) {
        var execution = [];
        var tasks = createTasks('task', 3, function (command) { return execution.push(command); });
        serial(tasks).execute().then(function () {
            expect(execution).to.deep.equal([
                'executing task 0',
                'complete task 0',
                'executing task 1',
                'complete task 1',
                'executing task 2',
                'complete task 2'
            ]);
            done();
        }).catch(function (error) { return done(error); });
    });
});
describe('parallel', function () {
    it('can run a set of tasks in parallel', function (done) {
        var execution = [];
        var tasks = createTasks('task', 3, function (command) { return execution.push(command); });
        parallel(tasks).execute().then(function () {
            expect(execution).to.deep.equal([
                'executing task 0',
                'executing task 1',
                'executing task 2',
                'complete task 0',
                'complete task 1',
                'complete task 2'
            ]);
            done();
        }).catch(function (error) { return done(error); });
    });
    it('can mix in serial sets of tasks', function (done) {
        var execution = [];
        var serial1Tasks = serial(createTasks('serial set 1 -', 2, function (command) { return execution.push(command); }));
        var parallelTasks = parallel(createTasks('parallel', 2, function (command) { return execution.push(command); }));
        var serial2Tasks = serial(createTasks('serial set 2 -', 2, function (command) { return execution.push(command); }));
        serial([
            serial1Tasks,
            parallelTasks,
            serial2Tasks
        ]).execute()
            .then(function () {
            expect(execution).to.deep.equal([
                'executing serial set 1 - 0',
                'complete serial set 1 - 0',
                'executing serial set 1 - 1',
                'complete serial set 1 - 1',
                'executing parallel 0',
                'executing parallel 1',
                'complete parallel 0',
                'complete parallel 1',
                'executing serial set 2 - 0',
                'complete serial set 2 - 0',
                'executing serial set 2 - 1',
                'complete serial set 2 - 1'
            ]);
            done();
        })
            .catch(function (error) { return done(error); });
    });
});
function createTasks(name, count, executionCallback) {
    return Array.apply(null, Array(count)).map(function (item, index) { return createTask(name + ' ' + index, executionCallback); });
}
function createTask(name, executionCallback) {
    return {
        execute: function () { return new Promise(function (done) {
            executionCallback("executing " + name);
            setTimeout(function () {
                executionCallback("complete " + name);
                done();
            }, 10);
        }); }
    };
}
