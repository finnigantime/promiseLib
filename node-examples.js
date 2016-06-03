exports = module.exports = (function () {
    "use strict";

    var request = require("request");
    //var Promise = require("bluebird");

    var Promise = require("./promiseLib");

    require("jsdom").env("", function (err, window) {
        Promise.setExternalDispatcher(window);
    });

    var fooResolver;

    var loadJquery = function () {
        var resolver = Promise.pending();
        fooResolver = resolver;

        require("jsdom").env("", function (err, window) {
            console.log("got jsdom... err=" + err);
            if (err) {
                console.error(err);
                resolver.reject(err);
            } else {
                var $ = require("jquery")(window);
                resolver.resolve($);
            }
        });

        return resolver.promise;
    };

    var fetchHTML = function (uri) {
        console.log("fetchHTML with uri: " + uri);
        var resolver = Promise.pending(undefined, undefined, function () {
            console.log("aborting request for uri: " + uri);
            httpRequest.abort();
        });

        var httpRequest = request({
            uri: uri
        }, function (error, response, body) {
            console.log("error: " + error);
            console.log("response: " + response);
            if (response !== undefined && response.statusCode === 200) {
                console.log("response.statusCode: " + response.statusCode);
                resolver.resolve(body);
            } else {
                resolver.reject({
                    error: error,
                    response: response
                });
            }
        });

        return resolver.promise;
    };

    var loadMLBTeamURLs = function ($) {
        return fetchHTML("http://espn.go.com/mlb/teams").then(function (body) {
            var html = $.parseHTML(body);

            var test = $(html).find("h4:contains(AL West)");
            var logos = test.parent().parent().find("ul.medium-logos");

            var teamUrls = logos.children().map(function (index, child) {
                var header = $(child).find("h5");
                return header.find("a").first().attr("href");
            });
            console.log("teamUrls.length: " + teamUrls.length);

            return teamUrls;
        });
    };

    var getWins = function (record) {
        var wins = record.substring(0, record.indexOf("-"));
        return parseInt(wins);
    };

    var getLosses = function (record) {
        var losses = record.substring(record.indexOf("-") + 1);
        return parseInt(losses);
    };

    var loadMLBTeamData = function ($, uri) {
        return fetchHTML(uri).then(function (body) {
            var html = $.parseHTML(body);
            var teamName = $(html).find("li.team-name").find("span.link-text").html();
            var record = $(html).find("li.record").html();

            return {
                teamName: teamName,
                record: record,
                wins: getWins(record),
                losses: getLosses(record)
            };
        });
    };


    var printALWestTable = function () {
        var ctx = {};
        console.log("Loading jquery...");
        return loadJquery().then(function (jquery) {
            console.log("jquery loaded...");
            ctx.$ = jquery;
            return loadMLBTeamURLs(ctx.$);
        }).then(function (teamUrls) {
            console.log("teamUrls: " + teamUrls);
            console.log("Object.keys(teamUrls): " + Object.keys(teamUrls));
            var teamDataPromises = teamUrls.map(function (index, teamUri) {
                return loadMLBTeamData(ctx.$, teamUri);
            });

            return Promise.all(teamDataPromises);
        }).then(function (teamData) {
            console.log("\nAL West Teams:");
            teamData.forEach(function (dataItem) {
                console.log(dataItem.teamName);
            });
            console.log("\n=== AL WEST STANDINGS ===");

            teamData
                .sort(function (a, b) {
                    return a.wins > b.wins || a.losses < b.losses;
                })
                .reverse()
                .forEach(function (dataItem, index) {
                    console.log((index + 1) + ". " + dataItem.teamName + " (" + dataItem.record + ")");
                });
        }).then(function () {
            console.log("\nall done!\n");
        });
    };

    var createESPNAndNBARequests = function () {
        var promise = fetchHTML("http://espn.go.com").then(function () {
            console.log("ESPN load promise fulfilled");
            fetchHTML("http://espn.go.com/nba/").then(function () {
                console.log("NBA load promise fulfilled");
            }, function () {
                console.log("NBA load promise rejected");
            }, function () {
                console.log("NBA load promise cancelled");
            });
        }, function () {
            console.log("ESPN load promise rejected");
        }, function () {
            console.log("ESPN load promise cancelled");
        });

        return promise;
    };

    var create404Request = function () {
        var promise = fetchHTML("http://page.that.does.not.exist.com").then(function () {
            console.log("bad request fulfilled");
        }, function () {
            console.log("bad request rejected");
        }, function () {
            console.log("bad request was cancelled");
        });
    };

    var cancelESPNRequest = function () {
        // TODO - make this into a promise
        createESPNAndNBARequests().cancel();
    };

    return {
        printALWestTable: printALWestTable,
        createESPNAndNBARequests: createESPNAndNBARequests,
        cancelESPNRequest: cancelESPNRequest,
        create404Request: create404Request
    };
})();