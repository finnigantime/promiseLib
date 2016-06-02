//var Promise = require("bluebird");
var Promise = require("./promiseLib");

mocha.setup("bdd");

describe("basic functionality", function () {
    it("can create a promise", function (done) {
        var out = Promise.pending();
        chai.expect(out).to.be.an("Object");
        done();
    });

    it("chained promise gets called on fulfilled promise", function (done) {
        Promise.fulfilled("fulfillValue").then(function (value) {
            chai.expect(value).to.equal("fulfillValue");
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
