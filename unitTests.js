var isUsingPromiseLib = false;
//var Promise = require("bluebird");
//var Promise = require("./HBOCodeLabs-bluebird")

var Promise = require("./promiseLib");
var isUsingPromiseLib = true;

mocha.setup("bdd");

var unexpectedSpy = function () {
    throw new Error("unexpected function call");
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

describe("cancellation using Bluebird 2.x semantics", function () {
    before(function () {
        if (isUsingPromiseLib === true) {
            Promise.setUseBluebirdSemantics(true);
        } else {
            Promise.AlwaysCancellable = true;
        }
    });

    after(function () {
        if (isUsingPromiseLib === true) {
            Promise.setUseBluebirdSemantics(false);
        }
    });

    it("exposes Promise.CancellationError", function (done) {
        chai.expect(Promise.CancellationError).to.be.a("Function");
        done();
    });

    it("cancel causes rejection with Promise.CancellationError", function (done) {
        var resolver = Promise.pending();
        resolver.promise.then(unexpectedSpy, function (reason) {
            chai.expect(reason === Promise.CancellationError).to.be.false;
            chai.expect(reason instanceof Promise.CancellationError).to.be.true;
            chai.expect(reason.message).to.equal("cancellation error");
            done();
        }, unexpectedSpy);
        resolver.cancel("cancelValue");
    });

    it("cancel a fulfilled promise no-ops", function (done) {
        var resolver = Promise.pending();
        resolver.promise.then(done, unexpectedSpy, unexpectedSpy);
        resolver.fulfill();
        resolver.cancel();
    });

    it("cancel a rejected promise no-ops", function (done) {
        var resolver = Promise.pending();
        resolver.promise.then(unexpectedSpy, function (reason) {
            chai.expect(reason).to.equal("rejectValue");
            done();
        }, unexpectedSpy);
        resolver.reject("rejectValue");
        resolver.cancel();
    });
});

describe("cancellation using promiseLib semantics", function () {
    if (isUsingPromiseLib === true) {
        it("cancelled promise calls cancel handler", function (done) {
            var resolver = Promise.pending();
            resolver.promise.then(unexpectedSpy, unexpectedSpy, done);
            resolver.cancel();
        });
    }
});

describe("promiseLib configuration tests", function () {
    if (isUsingPromiseLib === true) {
        it("useBluebirdSemantics defaults to false", function (done) {
            var promise = Promise.pending().promise;
            chai.expect(promise.useBluebirdSemantics).to.be.false;
            done();
        });

        it("setUseBluebirdSemantics changes useBluebirdSemantics", function (done) {
            var promise = Promise.pending().promise;
            Promise.setUseBluebirdSemantics(true);
            chai.expect(promise.useBluebirdSemantics).to.be.true;
            Promise.setUseBluebirdSemantics(false);
            chai.expect(promise.useBluebirdSemantics).to.be.false;
            done();
        });
    }
});

