exports = module.exports = (function () {
    "use strict";

    var __global_id__ = 0;

    function Promise(resolveHandler, rejectHandler, initArgs) {
        this._linkedPromises = [];
        this._label = initArgs.label;
        this._settledValue = undefined;
        this._resolveHandler = resolveHandler;
        this._parent = undefined;
        this.__id = __global_id__;
        this._isLinked = initArgs.isLinked === true;
        __global_id__++;

        this._trace("created")
        this._trace("_resolveHandler: " + this._resolveHandler);
    }

    Promise.prototype._assert = function (condition, message) {
        if (condition !== true) {
            this._dumpPromiseGraph();
            throw new Error("failed assert: " + message);
        }
    };

    Promise.prototype.toString = function () {
        return "[" + this.__id + (this._label ? " (" + this._label + ")" : "") + "]";
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
        console.log("promise graph for promise " + this.__id);

        var rootPromise = this._getRootPromise();
        rootPromise._dump("");
    };

    Promise.prototype._dump = function (indent) {
        console.log(indent + this + " - _settledValue: " + (typeof this._settledValue));
        this._linkedPromises.forEach(function (linkedPromise) {
            linkedPromise._dump(indent + "  ");
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
    Promise.prototype.then = function (resolveHandler) {
        var linkedPromise = new Promise(resolveHandler, undefined, { isLinked: true, label: "linked" });
        linkedPromise._parent = this;
        this._trace("added linked promise - " + linkedPromise.__id);
        this._linkedPromises.push(linkedPromise);

        if (this._settledValue !== undefined) {
            this._trace("already resolved, so will resolve linked promise with _settledValue");
            linkedPromise._resolveLinkedPromise(this._settledValue);
        }

        return linkedPromise;
    };

    Promise.prototype._resolve = function (value) {
        var that = this;

        this._assert(this._settledValue === undefined, "should not _resolve promise that already has a _settledValue");

        this._trace("resolving with value of type: " + (typeof value));

        this._settledValue = value;

        // TODO - make sure _resolveHandler is not defined

        this._trace("will resolve linked promises. length=" + this._linkedPromises.length);
        this._linkedPromises.forEach(function (promise) {
            that._trace("resolving linked promise - " + promise.__id);
            promise._resolveLinkedPromise(value);
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

        this._assert(this._isLinked === true, "_resolveLinkedPromise should only be called for linked promises");
        var resolveValue = value;
        if (this._resolveHandler !== undefined) {
            this._trace("calling _resolveHandler with value of type " + (typeof value));
            this._trace("_resolveHandler: " + this._resolveHandler);
            resolveValue = this._resolveHandler(value);
        }

        // TODO - should probably handle this the other way where resolveValue is wrapped as a promise if it is not one already
        if (resolveValue instanceof Promise === false) {
            resolveValue = Promise.fulfilled(resolveValue);
            resolveValue._parent = this;
        }
        resolveValue.then(function (value) {
            this._resolve(value);
        });
    };

    Promise.fulfilled = function (value) {
        var newPromise = new Promise(undefined, undefined, { label: ".fulfilled" });
        newPromise._resolve(value);
        return newPromise;
    };

    function PromiseResolver() {
        this.promise = new Promise(undefined, undefined, { label: "resolver" });
    }

    PromiseResolver.prototype.resolve = function (value) {
        console.log("resolving resolver...");
        // TODO - can only resolve once
        this.promise._resolve(value);
    };

    var createResolver = function () {
        return new PromiseResolver();
    };

    var bundlePromises = function (promisesToBundle) {
        // TODO - bundle rejection together also

        var resolvedValues = [];
        var resolvedValuesCount = 0;

        var allResolver = new PromiseResolver();
        allResolver.promise._label = "ALL";

        promisesToBundle.forEach(function (promise, index) {
            promise.then(function (value) {
                allResolver.promise._trace("allResolver - resolved Promise i=" + index + " with value=" + value);
                resolvedValuesCount += 1;
                resolvedValues[index] = value;

                // TODO - what if promisesToBundle gets modified while processing it?
                if (resolvedValuesCount === promisesToBundle.length) {
                    allResolver.promise._trace("all promises resolved!");
                    allResolver.resolve(resolvedValues);
                }
            });
        });
    };

    return {
        pending: createResolver,
        all: bundlePromises
    };
})();