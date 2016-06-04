promiseLib

Patrick Finnigan
(finnigantime on GitHub)
DSL (CSEP 590) Spring 2016
Project 5


### SUMMARY
Javascript Promise library (toy library)

### FILES
- promiseLib.js: the actual library
- demo.mov: screencast demo (deleted from local repo since it was so big. uploaded to YouTube here: https://youtu.be/lsahLTtsa6Q )
- node-examples.js: test examples that can be run in node
- promiseLib-testPage.html: webpage for running unit tests in the browser and showing results
- unitTests.js: unit tests


### INSTALL
"npm install" should install all module dependencies.

To install Bluebird v2.X for comparison (e.g. to run my unit tests against Bluebird):
1. go into HBOCodeLabs-bluebird
2. "npm install" here
3. "grunt build" here


### RUNNING
To run the node-example scripts:
1. Launch node (`node`)
2. Pull in the node-examples module (`var examples = require("./node-examples")`)
3. Dump the module to see available test methods (`examples`)
4. Call the various test methods to test different scenarios.

The example script scenarios cover fulfillment, cancellation, rejection, Promise.all bundling. For example, the first test here hits ESPN and scrapes the team names and links for teams in the AL West division, then requests each team page as a separate promise and uses Promise.all() to synchronize their results and print a standings table.

To run the unit tests:
Launch promiseLib-testPage.html in a browser.

To build the unit tests for running in a browser:
`browserify test.js -o bundle.js`

To run the unit tests against Bluebird instead of against my promiseLib implementation (for comparison purposes):
1. Uncomment the require statement at the top of unitTests.js for including Bluebird.
2. Comment out the require statement and subsequent 2 lines for including promiseLib.
3. Rebuild unit tests.
4. Launch the test harness (promiseLib-testPage.html) in a browser.


### DESIGN RATIONALE
For this project, I've implemented a toy promise library modled off the A+ promise spec and the Bluebird promise library which implements the A+ spec (https://github.com/petkaantonov/bluebird). This project was motivated by the shortcomings of handling promise cancellation in the A+ spec (which cancellation isn't a part of) and by shortcomings in Bluebird V2.X. My team at HBO Code Labs currently uses a fork of Bluebird V2.X with some modifications (https://github.com/HBOCodeLabs/bluebird). Bluebird V3.X has addressed many of these (http://bluebirdjs.com/docs/api/cancellation.html), but I didn't realize this until after implementing most of my promiseLib functionality and then trying my unit tests against the most recent version of Bluebird for comparison purposes. Looks like Bluebird 3.X landed very similarly to my changes.

Departures from Bluebird 2.X I made in my library were:
- Cancellation is non-optional and always supported
- Promise cancellation is synchronous
- Promise cancellation is not bundled as rejection
- A separate cancelHandler can be provided

For use in client scenarios (i.e. fetching data async from services, waiting for animations to complete, running work items at intervals e.g. repeating click handler), cancellation is important. It can provide performance enhancement since entire graphs of Promises can be thrown away and in-progress work items associated with that graph can be aborted. I opted to make cancellation synchronous since async cancellation is a headache. Async cancellation may get trumped by another resolution (reject, fulfill). Also, cancellation is often associated with disposal of an instance. If cancellation is async, cancellation handling may happen async after the instance has been disposed (as opposed to handling during disposal), which can be tricky to handle in my experience.

I chose to add a separate cancelHandler because Bluebird 2.X's treatment of cancellation as a rejection is difficult to work with. In Bluebird 2.X, cancelling a promise rejects it with Promise.CancellationError. So, the rejectHandler will run and requires a check and separate codepath for when the rejection reason is Promise.CancellationError if you want cancellation to be treated differently than rejection due to an unexpected error. This requires developers to always be thinking about cancellation when writing promise rejectionHandlers to handle errors, and the extra codepath in the rejection handlers requires additional unit tests to be written (and unit tests for async rejection aren't the simplest to write, either). I added a separate codepath configured by the useBluebirdV2Semantics flag for parity with Bluebird v2.X, so that my promiseLib can be used with a codebase that currently uses Bluebird v2.X and depends on its semantics. This way, if I wanted to get my library fully operational with an existing codebase that's on Bluebird v2.X (such as the HBO Go client codebase), I can set this flag and continue to add functionality and fix bugs until I have parity. Then, I can switch the flag off and modify the codebase to work with the new cancellation semantics I added (close to Bluebird 3.x).

I didn't fully implement a promise library but I think I hit some core functionality well:
- Promise with optional handlers: resolverHandler, rejectHandler, cancelHandler
- PromiseResolver for providing pending promises and managing promise resolution
- Promise.then() and linked promise resolution
- Promise.all() and promise bundling
- deferred resolution for promise fulfillment and rejection, and optional synchronous resolution for cancellation
- configurable external dispatcher, allowing library to be used in node on the command line and in the browser
- configurable flag useBluebirdV2Semantics
- tracing functionality for debugging

I used Node.js for managing dependencies and since it's nice to be able to export this promiseLib as a node module, but promiseLib.js can also be run in the browser directly. I used browserify to be able to have the unit tests depend on node modules (e.g. Bluebird) but still be able to run them in the browser with the HTML-based results reporter. I first wrote a bunch of unit tests against Bluebird and some example code in node-examples.js against Bluebird and used these tests to drive the development of my promiseLib as I iteratively fleshed it out and fixed bugs.

