var request = require("request");
var Promise = require("bluebird");

var myWindow;
var resolver = Promise.pending();

var requestCallback = function(error, response, body) {
    console.log("request successful...");
    myWindow.document.body = body;
    var $ = require("jquery")(myWindow);
    var html = $.parseHTML(body);

    var test = $(html).find("h4:contains(AL West)");
    var logos = test.parent().parent().find("ul.medium-logos");

    logos.children().each(function (index, child) {
        console.log("child: " + child);
        var header = $(child).find("h5");
        var link = header.find("a").first().attr("href");
        console.log("got one: " + link);
    });
    console.log("len: " + logos.children().length);
    resolver.resolve();
};

var jsdomCallback = function(err, window) {
    if (err) {
        console.error(err);
        return;
    }

    myWindow = window;

    request({
        uri: "http://espn.go.com/mlb/teams",
    }, requestCallback);
};

require("jsdom").env("", jsdomCallback);

resolver.promise.then(function () {
    console.log("all done");
});
