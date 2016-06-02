//var Promise = require("bluebird");
var Promise = require("./promiseLib");

mocha.setup("bdd");

var unexpectedSpy = function () {
    chai.fail("unexpected function call");
};

describe("basic functionality", function () {
    it("can create a promise", function (done) {
        var out = Promise.pending();
        chai.expect(out).to.be.an("Object");
        done();
    });

    it("fulfilled promise calls fulfill handler", function (done) {
        var resolver = Promise.pending();
        resolver.promise.then(done, unexpectedSpy, unexpectedSpy);
        resolver.resolve();
    });

    it("rejected promise calls reject handler", function (done) {
        var resolver = Promise.pending();
        resolver.promise.then(unexpectedSpy, done, unexpectedSpy);
        resolver.reject();
    });

    it("cancelled promise calls cancel handler", function (done) {
        var resolver = Promise.pending();
        resolver.promise.then(unexpectedSpy, unexpectedSpy, done);
        resolver.cancel();
    });

    it("chained promise gets called on fulfilled promise", function (done) {
        Promise.fulfilled("fulfillValue").then(function (value) {
            chai.expect(value).to.equal("fulfillValue");
            done();
        }, unexpectedSpy);
    });

    it("chained promise gets called on rejected promise", function (done) {
        Promise.rejected("rejectValue").then(unexpectedSpy, function (value) {
            chai.expect(value).to.equal("rejectValue");
            done();
        });
    });

    it("chained promise gets fulfilled upon fulfillment if added before promise fulfills", function (done) {
        var resolver = Promise.pending();
        resolver.promise.then(function (value) {
            chai.expect(value).to.equal("fulfillValue");
            done();
        });
        resolver.resolve("fulfillValue");
    });

    it("chained promise gets fulfilled upon fulfillment if added after promise fulfills", function (done) {
        var resolver = Promise.pending();
        resolver.resolve("fulfillValue");
        resolver.promise.then(function () {
            resolver.promise.then(function (value) {
                chai.expect(value).to.equal("fulfillValue");
                done();
            });
        });
    });

    it(".then promise with fulfillHandler that returns undefined", function (done) {
        Promise.fulfilled().then(function () {
            return;
        }).then(function (value) {
            chai.expect(value).to.be.undefined;
            done();
        });
    });

    it(".then promise with fulfillHandler that returns Promise.fulfilled(undefined)", function (done) {
        Promise.fulfilled().then(function () {
            return Promise.fulfilled();
        }).then(function (value) {
            chai.expect(value).to.be.undefined;
            done();
        });
    });
});

describe("Promise.all", function () {
    it(".all chains promise results to resolve", function (done) {
        Promise.all([ Promise.fulfilled(), Promise.fulfilled(), Promise.fulfilled() ]).then(function (result) {
            chai.expect(result).to.deep.equal([ undefined, undefined, undefined ]);
            done();
        });
    });
});

