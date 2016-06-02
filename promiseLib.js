exports = module.exports = (function () {
    "use strict";

    var __global_id__ = 0;

    function Promise(resolveHandler, rejectHandler, cancelHandler /*, varargs initArgs */) {

        var initArgs = {};
        console.log("args length: " + arguments.length);
        for (var i = 3; i < arguments.length; ++i) {
            var args = arguments[i];
            Object.keys(args).forEach(function (key) {
                initArgs[key] = args[key]
            });
        }

        this._linkedPromises = [];
        this._children = [];
        this._label = initArgs.label;

        this._isSettled = false;
        this._isFulfilled = false;
        this._isRejected = false;
        this._isCancelled = false;
        this._settledValue = undefined;

        this._resolveHandler = resolveHandler;
        this._rejectHandler = rejectHandler;
        this._cancelHandler = cancelHandler;
        this._parent = initArgs.parent;
        if (this._parent !== undefined) {
            this._parent._children.push(this);
        }
        this.__id = "p" + __global_id__;
        this._isLinked = initArgs.isLinked === true;
        __global_id__++;

        this._trace("created")
        this._trace("_resolveHandler: " + this._resolveHandler);
        this._dumpPromiseGraph();
    }

    Promise.prototype._assert = function (condition, message) {
        if (condition !== true) {
            this._dumpPromiseGraph();
            throw new Error("failed assert: " + message);
        }
    };

    Promise.prototype.toString = function () {
        var parent = " parent=" + (this._parent ? this._parent.__id : undefined);
        var settled = " _isSettled=" + this._isSettled;
        return "[" + this.__id + (this._label ? " (" + this._label + ")" : "") + parent + settled + "]";
    };

    Promise.prototype._trace = function (message) {
        var prefix = this + ": ";
        console.log(prefix + message);
    };

    Promise.prototype._getRootPromise = function () {
        var root = this;
        while (root._parent !== undefined) {
            root = root._parent;
        }
        return root;
    };

    Promise.prototype._dumpPromiseGraph = function () {
        console.log("promise graph for promise " + this.__id + ":");

        var rootPromise = this._getRootPromise();
        rootPromise._dump("");
        console.log();
    };

    Promise.prototype._dump = function (indent, isLinked) {
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
                linkedPromise._cancelLinkedPromise();
            }
        }

        return linkedPromise;
    };

    Promise.prototype._resolve = function (value) {
        var that = this;

        this._assert(this._isSettled === false, "should not _resolve promise that is already settled");

        this._trace("resolving with value of type: " + (typeof value));

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

    Promise.prototype._reject = function (value) {
        var that = this;

        this._assert(this._isSettled === false, "should not _reject promise that is already settled");

        this._trace("rejecting with value: " + value);

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

    Promise.prototype._cancel = function (value) {
        var that = this;

        this._assert(this._isSettled === false, "should not _cancel promise that is already settled");

        this._trace("cancelling");

        this._isSettled = true;
        this._isCancelled = true;

        // TODO - make sure _cancelHandler is not defined

        this._trace("will cancel linked promises. length=" + this._linkedPromises.length);
        this._linkedPromises.forEach(function (promise) {
            that._trace("cancelling linked promise - " + promise.__id);
            promise._cancelLinkedPromise(value);
        });
    };

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

    function PromiseResolver() {
        this.promise = new Promise(undefined, undefined, undefined, { label: "resolver" });
    }

    PromiseResolver.prototype.resolve = function (value) {
        console.log("resolving resolver...");
        // TODO - can only resolve once
        this.promise._resolve(value);
    };

    PromiseResolver.prototype.reject = function (reason) {
        console.log("rejecting resolver...");
        // TODO - can only resolve once
        this.promise._reject(reason);
    };

    PromiseResolver.prototype.cancel = function () {
        console.log("cancelling resolver...");
        // TODO - can only resolve once
        this.promise._cancel();
    };

    var createResolver = function () {
        return new PromiseResolver();
    };

    var createFulfilled = function (value) {
        var newPromise = new Promise(undefined, undefined, undefined, { label: ".fulfilled" });
        // TODO - weird to not do this as an init arg
        newPromise._resolve(value);
        return newPromise;
    };

    var createRejected = function (value) {
        var newPromise = new Promise(undefined, undefined, undefined, { label: ".rejected" });
        // TODO - weird to not do this as an init arg
        newPromise._reject(value);
        return newPromise;
    };

    var bundlePromises = function (promisesToBundle) {
        // TODO - bundle rejection together also

        var resolvedValues = [];
        var resolvedValuesCount = 0;

        var allResolver = new PromiseResolver();
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

    return {
        pending: createResolver,
        fulfilled: createFulfilled,
        rejected: createRejected,
        all: bundlePromises
    };
})();