var Bluebird = require("bluebird");

console.log("got Promise");

var resolver = Bluebird.pending();
resolver.promise.then(function (val) {
    console.log("oh yeah bluebird! " + val);
});
resolver.resolve("output");

require("./unitTests");
