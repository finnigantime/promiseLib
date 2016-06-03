exports = module.exports = (function () {
    "use strict";

    var __global_id__ = 0;

    // Constructor for Promise, the core class in this library.
    //  - resolveHandler: callback to run when the Promise fulfills. Its return value gets set to the Promise's settled value.
    //  - rejectHandler: callback to run when the Promise rejects. Its return value gets set to the Promise's settled value.
    //  - cancelHandler: callback to run when the Promise cancels.
    //  - varargs initArgs: optional array of objects that specify property value mappings to set on the new Promise.
    function Promise(resolveHandler, rejectHandler, cancelHandler /*, varargs initArgs */) {
        // process varargs of the initArgs. Each one is an object that represents a mapping of property names to
        // property values that should be set on the new Promise instance.
        var initArgs = {};
        for (var i = 3; i < arguments.length; ++i) {
            var args = arguments[i];
            Object.keys(args).forEach(function (key) {
                initArgs[key] = args[key]
            });
        }

        // linked promises state
        this._linkedPromises = [];
        this._linkedPromisesCancelledCount = 0;
        this._children = [];
        this._parent = initArgs.parent;
        if (this._parent !== undefined) {
            this._parent._children.push(this);
        }

        // resolution state
        this._isSettled = false;
        this._isFulfilled = false;
        this._isRejected = false;
        this._isCancelled = false;
        this._settledValue = undefined;

        // handler state
        this._resolveHandler = resolveHandler;
        this._rejectHandler = rejectHandler;
        this._cancelHandler = cancelHandler;

        // metadata for tracing
        this._label = initArgs.label;
        this.__id = "p" + __global_id__;
        this._isLinked = initArgs.isLinked === true;
        __global_id__++;

        this._trace("created")
        this._trace("_resolveHandler: " + this._resolveHandler);
        this._dumpPromiseGraph();
    }

    // enable debug-level tracing
    // Promise management is async, so tracing is usually the best way to debug Promises (similar to debugging distributed systems).
    Promise.prototype.enableTracing = true;
    function setEnableTracing(newVal) {
        Promise.prototype.enableTracing = newVal;
    }

    // enable API parity with Bluebird 2.X
    // This changes some of the library behavior (e.g. cancellation is async and is treated as rejection in Bluebird 2.X).
    // Setting this flag allows the promiseLib to be integrated into codebases that are currently using Bluebird 2.X.
    Promise.prototype.useBluebirdV2Semantics = false;
    function setUseBluebirdV2Semantics(newVal) {
        Promise.prototype.useBluebirdV2Semantics = newVal;
    }

    // set external dispatcher
    // This is a required setup step. The external dispatcher is any object that has a method setTimeout defined:
    //   function setTimeout(callback, delayMS);
    //
    // Having a configurable externalDispatcher allows the promiseLib to be used both from nodejs on the command line
    // and within a browser. Passing an instance of "window" suffices.
    Promise.prototype.externalDispatcher = undefined;
    function setExternalDispatcher(newVal) {
        Promise.prototype.externalDispatcher = newVal;
    }

    // Assertion helper that dumps the promise graph and prints the given message if the condition is not met.
    Promise.prototype._assert = function (condition, message) {
        if (condition !== true) {
            this._dumpPromiseGraph();
            throw new Error("failed assert: " + message);
        }
    };

    // pretty-print a Promise instance using its debug metadata
    Promise.prototype.toString = function () {
        var parent = " parent=" + (this._parent ? this._parent.__id : undefined);
        var settled = " _isSettled=" + this._isSettled;
        return "[" + this.__id + (this._label ? " (" + this._label + ")" : "") + parent + settled + "]";
    };

    // tracing helper
    Promise.prototype._trace = function (message) {
        if (Promise.prototype.enableTracing === true) {
            var prefix = this + ": ";
            console.log(prefix + message);
        }
    };

    // Walks up the parent links to get the root of the graph the current promise is connected to.
    Promise.prototype._getRootPromise = function () {
        var root = this;
        while (root._parent !== undefined) {
            root = root._parent;
        }
        return root;
    };

    // Prints out the promise graph hierarchy for the graph the current promise is connected to.
    Promise.prototype._dumpPromiseGraph = function () {
        if (Promise.prototype.enableTracing === true) {
            console.log("promise graph for promise " + this.__id + ":");

            var rootPromise = this._getRootPromise();
            rootPromise._dump("");
            console.log();
        }
    };

    // Pretty-prints the current promise along with some helpful metadata like its settled value. Useful for debugging.
    Promise.prototype._dump = function (indent, isLinked) {
        if (Promise.prototype.enableTracing === true) {
            var that = this;
            var line = indent + this;
            if (isLinked === true) {
                line = line + " (LINKED)";
            }
            line = line + " - _isSettled: " + this._isSettled + ", _settledValue: " + (typeof this._settledValue);
            console.log(line);
            this._children.forEach(function (child) {
                var isLinked = that._linkedPromises.indexOf(child) >= 0;
                child._dump(indent + "  ", isLinked);
            });
        }
    };

    // Handler for when a child (i.e. linked) promise gets cancelled.
    // If all child promises are cancelled, the parent promise is also cancelled.
    Promise.prototype.onLinkedPromiseCancelled = function () {
        this._trace("onLinkedPromiseCancelled");

        this._linkedPromisesCancelledCount += 1;

        if (this._isSettled !== true) {
            // TODO - _cancelHandler call below should be refactored to be part of _cancel
            if (Promise.prototype.useBluebirdV2Semantics === true) {
                var cancelValue = this._cancelHandler ? this._cancelHandler() : undefined;
                this._cancel(cancelValue);
            } else {
                if (this._linkedPromisesCancelledCount >= this._linkedPromises.length) {
                    this._trace("_linkedPromisesCancelledCount: " + this._linkedPromisesCancelledCount);
                    this._trace("_linkedPromises.length: " + this._linkedPromises.length);
                    this._assert(
                        this._linkedPromisesCancelledCount === this._linkedPromises.length,
                        "_linkedPromisesCancelledCount should not exceed _linkedPromises.length"
                    );

                    var cancelValue = this._cancelHandler ? this._cancelHandler() : undefined;
                    this._cancel(cancelValue);
                }
            }
        }
    };

    // a.then(b).then(c)
    // creates promises:
    //   - p.a (existing promise)
    //   - p.b (thenned promise. has resolveHandler b)
    //   - p.c (thenned promise. has resolveHandler c)
    // resolution:
    //   - p.a resolves with v.a
    //   - p.b calls b(v.a) and resolves with its return value
    //   - p.c calls c(return value of b(v.a)) and resolves with its return value
    //
    // TODO - handle case where we already have a _settledValue
    Promise.prototype.then = function (resolveHandler, rejectHandler, cancelHandler) {
        var linkedPromise = new Promise(resolveHandler, rejectHandler, cancelHandler, { isLinked: true, label: "linked", parent: this });
        this._trace("added linked promise - " + linkedPromise.__id);
        this._linkedPromises.push(linkedPromise);

        if (this._isSettled === true) {
            if (this._isFulfilled === true) {
                this._trace("already fulfilled, so will resolve linked promise with _settledValue");
                linkedPromise._resolveLinkedPromise(this._settledValue);
            } else if (this._isRejected === true) {
                this._trace("already rejected, so will reject linked promise with _settledValue");
                linkedPromise._rejectLinkedPromise(this._settledValue);
            } else {
                this._assert(this._isCancelled === true, "expected _isCancelled to be true");
                this._trace("already cancelled, so will cancel linked promise");
            }
        }

        return linkedPromise;
    };

    // Attempt to fulfill the promise with the given value. No-ops if the promise resolution is already settled.
    Promise.prototype._resolve = function (value) {
        var that = this;

        this._trace("resolving with value of type: " + (typeof value));

        if (this._isSettled === true) {
            this._trace("already settled, returning...");
            return;
        }

        this._settledValue = value;
        this._isSettled = true;
        this._isFulfilled = true;

        // TODO - make sure _resolveHandler is not defined

        this._trace("will resolve linked promises. length=" + this._linkedPromises.length);
        this._linkedPromises.forEach(function (promise) {
            that._trace("resolving linked promise - " + promise.__id);
            promise._resolveLinkedPromise(value);
        });
    };

    // Attempt to reject the promise with the given value. No-ops if the promise resolution is already settled.
    Promise.prototype._reject = function (value) {
        var that = this;

        this._trace("rejecting with value: " + value);

        if (this._isSettled === true) {
            this._trace("already settled, returning...");
            return;
        }

        this._settledValue = value;
        this._isSettled = true;
        this._isRejected = true;

        // TODO - make sure _rejectHandler is not defined

        this._trace("will reject linked promises. length=" + this._linkedPromises.length);
        this._linkedPromises.forEach(function (promise) {
            that._trace("rejecting linked promise - " + promise.__id);
            promise._rejectLinkedPromise(value);
        });
    };

    // Attempt to cancel the promise with the given value. No-ops if the promise resolution is already settled.
    // TODO - does it make sense to allow cancel with a value?
    Promise.prototype._cancel = function (value) {
        var that = this;

        this._trace("cancelling");

        if (this._isSettled === true) {
            this._trace("already settled, returning...");
            return;
        }

        this._isSettled = true;
        this._isCancelled = true;

        if (this._parent !== undefined) {
            this._parent.onLinkedPromiseCancelled();
        }

        // TODO - make sure _cancelHandler is not defined

        this._trace("will cancel linked promises. length=" + this._linkedPromises.length);
        this._linkedPromises.forEach(function (promise) {
            that._trace("cancelling linked promise - " + promise.__id);
            promise._cancelLinkedPromise(value);
        });
    };

    // Allow public cancellation directly on a Promise instance.
    Promise.prototype.cancel = Promise.prototype._cancel;

    // Fulfills a linked promise attached by .then().
    //
    // a.then(function b(a.v) {
    //     return c(a.v);
    // }).then(d);
    // creates promises:
    //   - p.a (existing promise)
    //   - p.b (thenned promise. has resolveHandler b)
    //   - b.v (value returned from c)
    //   - p.d (thenned promise. has resolveHandler d)
    //
    // If c returns a non-promise value, we can call d(value).
    // If c returns a promise, we must do c.then(d)
    Promise.prototype._resolveLinkedPromise = function (value) {
        var that = this;

        this._assert(this._isLinked === true, "should only be called for linked promises");
        var resolveValue = value;
        if (this._resolveHandler !== undefined) {
            this._trace("calling _resolveHandler with value of type " + (typeof value));
            this._trace("_resolveHandler: " + this._resolveHandler);
            resolveValue = this._resolveHandler(value);
        }

        // TODO - should probably handle this the other way where resolveValue is wrapped as a promise if it is not one already
        this._trace("_resolveHandler completed with value of type: " + (typeof resolveValue));
        if (resolveValue instanceof Promise === true) {
            this._trace("resolveValue is promise (" + resolveValue.__id + "), will wait for it to resolve before resolving this promise");

            resolveValue.then(function (value) {
                that._trace("resolveValue promise returned with value of type: " + value);

                that._resolve(value);
            });
        } else {
            this._resolve(resolveValue);
        }
    };

    // Rejects a linked promise attached by .then().
    Promise.prototype._rejectLinkedPromise = function (value) {
        var that = this;

        this._assert(this._isLinked === true, "should only be called for linked promises");

        var rejectValue = value;
        if (this._rejectHandler !== undefined) {
            this._trace("calling _rejectHandler with value of type " + (typeof value));
            this._trace("_rejectHandler: " + this._rejectHandler);
            rejectValue = this._rejectHandler(value);
        }

        // TODO - should probably handle this the other way where rejectValue is wrapped as a promise if it is not one already
        this._trace("_rejectHandler completed with value of type: " + (typeof rejectValue));
        if (rejectValue instanceof Promise === true) {
            this._trace("rejectValue is promise (" + rejectValue.__id + "), will wait for it to resolve before resolving this promise");

            rejectValue.then(function (value) {
                that._trace("rejectValue promise returned with value of type: " + value);

                that._reject(value);
            });
        } else {
            this._reject(rejectValue);
        }
    };

    // Cancels a linked promise attached by .then().
    Promise.prototype._cancelLinkedPromise = function () {
        var that = this;

        this._assert(this._isLinked === true, "should only be called for linked promises");

        // TODO - should _cancelHandler be allowed to return a value?
        var cancelValue;
        if (this._cancelHandler !== undefined) {
            this._trace("calling _cancelHandler");
            this._trace("_cancelHandler: " + this._cancelHandler);
            cancelValue = this._cancelHandler();
        }

        // TODO - should probably handle this the other way where rejectValue is wrapped as a promise if it is not one already
        this._trace("_cancelHandler completed with value of type: " + (typeof cancelValue));
        if (cancelValue instanceof Promise === true) {
            this._trace("cancelValue is promise (" + cancelValue.__id + "), will wait for it to resolve before resolving this promise");

            cancelValue.then(function (value) {
                that._trace("cancelValue promise returned with value of type: " + value);

                that._cancel(value);
            });
        } else {
            this._cancel(cancelValue);
        }
    };

    // Using the external dispatcher, defer the given callback so it happens on a different frame.
    // This allows remaining sync code on this frame to finish before the callback is run.
    // Javascript is single-threaded, so using an external dispatcher to schedule a callback on the next frame is
    // the way to achieve async work.
    function defer(callback) {
        Promise.prototype.externalDispatcher.setTimeout(callback, 10);
    }

    // Constructor for PromiseResolver, which owns an underlying promise and manages resolution of its promise.
    function PromiseResolver(resolveHandler, rejectHandler, cancelHandler) {
        this.promise = new Promise(resolveHandler, rejectHandler, cancelHandler, { label: "resolver" });
    }

    // Fulfills a PromiseResolver's pending promise with the given value. Fulfillment is async.
    PromiseResolver.prototype.resolve = function (value) {
        this.promise._trace("resolving resolver...");
        // TODO - can only resolve once
        var that = this;
        defer(function () {
            that.promise._resolve(value);
        });
    };

    // Alias for resolve().
    PromiseResolver.prototype.fulfill = function (value) {
        return this.resolve(value);
    };

    // Rejects a PromiseResolver's pending promise with the given value. Rejection is async.
    PromiseResolver.prototype.reject = function (reason) {
        this.promise._trace("rejecting resolver...");
        // TODO - can only resolve once
        var that = this;
        defer(function () {
            that.promise._reject(reason);
        });
    };

    // Cancels a PromiseResolver's promise.
    PromiseResolver.prototype.cancel = function () {
        this.promise._trace("cancelling resolver...");
        // TODO - can only resolve once

        // For Bluebird 2.X semantics, cancellation is async and is bundled with rejection using Promise.CancellationError.
        if (Promise.prototype.useBluebirdV2Semantics === true) {
            var that = this;
            defer(function () {
                that.promise._reject(new CancellationError());
            });
        } else {
            // For promiseLib semantics, cancellation is sync and is not bundled with rejection. It calls a separate
            // cancelHandler.
            this.promise._cancel();
        }
    };

    // Implements Promise.pending(), a PromiseResolver that has not decided its value yet.
    var createResolver = function (resolveHandler, rejectHandler, cancelHandler) {
        return new PromiseResolver(resolveHandler, rejectHandler, cancelHandler);
    };

    // Implements Promise.fulfilled(), a Promise with a fulfilled value. Note that fulfillment is async.
    var createFulfilled = function (value) {
        var newPromise = new Promise(undefined, undefined, undefined, { label: ".fulfilled" });
        // TODO - weird to not do this as an init arg
        defer(function () {
            newPromise._resolve(value);
        });
        return newPromise;
    };

    // Implements Promise.rejected(), a Promises with a rejected value. Note that rejection is async.
    var createRejected = function (value) {
        var newPromise = new Promise(undefined, undefined, undefined, { label: ".rejected" });
        // TODO - weird to not do this as an init arg
        defer(function () {
            newPromise._reject(value);
        });
        return newPromise;
    };

    // Implements Promise.all(). Takes promisesToBundle and links them together.
    // Returns a new promise that resolves when all the promisesToBundle have resolved.
    var bundlePromises = function (promisesToBundle) {
        // TODO - bundle rejection together also

        var resolvedValues = [];
        var resolvedValuesCount = 0;

        var allResolver = new PromiseResolver(undefined, undefined, function () {
            // TODO - cancelHandler should get called for _cancel direct calls, not just cancelling linked promise
            allResolver.promise._trace("cancelHandler. cancelling promisesToBundle... (length=" + promisesToBundle.length + ")");
            for (var i = 0; i < promisesToBundle.length; ++i) {
                var promise = promisesToBundle[i];
                promise.cancel();
            }
        });
        allResolver.promise._label = "ALL";

        // TODO - what if promisesToBundle gets modified while processing it?
        for (var i = 0; i < promisesToBundle.length; ++i) {
            var promise = promisesToBundle[i];
            var createHandler = function (index) {
                return function (value) {
                    allResolver.promise._trace("allResolver - resolved Promise i=" + index + " with value=" + value);
                    resolvedValuesCount += 1;
                    resolvedValues[index] = value;

                    if (resolvedValuesCount === promisesToBundle.length) {
                        allResolver.promise._trace("all promises resolved!");
                        allResolver.resolve(resolvedValues);
                    }
                }
            };
            promise.then(createHandler(i));
        }

        return allResolver.promise;
    };

    // Bluebird 2.X way of indicating a rejection due to cancellation
    function CancellationError() {
        this.message = "cancellation error";
    }

    return {
        setEnableTracing: setEnableTracing,
        setUseBluebirdV2Semantics: setUseBluebirdV2Semantics,
        setExternalDispatcher: setExternalDispatcher,
        CancellationError: CancellationError,
        pending: createResolver,
        fulfilled: createFulfilled,
        rejected: createRejected,
        all: bundlePromises
    };
})();