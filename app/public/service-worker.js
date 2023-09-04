// SDK version: v1.0.2
// Git commit: bc6831d1ab41b3b1a3de2297f7024efbb2772d8e

"use strict";

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

var defineProperty = _defineProperty;

function _objectSpread(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};
    var ownKeys = Object.keys(source);

    if (typeof Object.getOwnPropertySymbols === "function") {
      ownKeys = ownKeys.concat(
        Object.getOwnPropertySymbols(source).filter(function (sym) {
          return Object.getOwnPropertyDescriptor(source, sym).enumerable;
        })
      );
    }

    ownKeys.forEach(function (key) {
      defineProperty(target, key, source[key]);
    });
  }

  return target;
}

var objectSpread = _objectSpread;

function createCommonjsModule(fn, module) {
  return (module = { exports: {} }), fn(module, module.exports), module.exports;
}

var runtime_1 = createCommonjsModule(function (module) {
  /**
   * Copyright (c) 2014-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  var runtime = (function (exports) {
    var Op = Object.prototype;
    var hasOwn = Op.hasOwnProperty;
    var undefined$1; // More compressible than void 0.
    var $Symbol = typeof Symbol === "function" ? Symbol : {};
    var iteratorSymbol = $Symbol.iterator || "@@iterator";
    var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
    var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

    function wrap(innerFn, outerFn, self, tryLocsList) {
      // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
      var protoGenerator =
        outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
      var generator = Object.create(protoGenerator.prototype);
      var context = new Context(tryLocsList || []);

      // The ._invoke method unifies the implementations of the .next,
      // .throw, and .return methods.
      generator._invoke = makeInvokeMethod(innerFn, self, context);

      return generator;
    }
    exports.wrap = wrap;

    // Try/catch helper to minimize deoptimizations. Returns a completion
    // record like context.tryEntries[i].completion. This interface could
    // have been (and was previously) designed to take a closure to be
    // invoked without arguments, but in all the cases we care about we
    // already have an existing method we want to call, so there's no need
    // to create a new function object. We can even get away with assuming
    // the method takes exactly one argument, since that happens to be true
    // in every case, so we don't have to touch the arguments object. The
    // only additional allocation required is the completion record, which
    // has a stable shape and so hopefully should be cheap to allocate.
    function tryCatch(fn, obj, arg) {
      try {
        return { type: "normal", arg: fn.call(obj, arg) };
      } catch (err) {
        return { type: "throw", arg: err };
      }
    }

    var GenStateSuspendedStart = "suspendedStart";
    var GenStateSuspendedYield = "suspendedYield";
    var GenStateExecuting = "executing";
    var GenStateCompleted = "completed";

    // Returning this object from the innerFn has the same effect as
    // breaking out of the dispatch switch statement.
    var ContinueSentinel = {};

    // Dummy constructor functions that we use as the .constructor and
    // .constructor.prototype properties for functions that return Generator
    // objects. For full spec compliance, you may wish to configure your
    // minifier not to mangle the names of these two functions.
    function Generator() {}
    function GeneratorFunction() {}
    function GeneratorFunctionPrototype() {}

    // This is a polyfill for %IteratorPrototype% for environments that
    // don't natively support it.
    var IteratorPrototype = {};
    IteratorPrototype[iteratorSymbol] = function () {
      return this;
    };

    var getProto = Object.getPrototypeOf;
    var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
    if (
      NativeIteratorPrototype &&
      NativeIteratorPrototype !== Op &&
      hasOwn.call(NativeIteratorPrototype, iteratorSymbol)
    ) {
      // This environment has a native %IteratorPrototype%; use it instead
      // of the polyfill.
      IteratorPrototype = NativeIteratorPrototype;
    }

    var Gp =
      (GeneratorFunctionPrototype.prototype =
      Generator.prototype =
        Object.create(IteratorPrototype));
    GeneratorFunction.prototype = Gp.constructor = GeneratorFunctionPrototype;
    GeneratorFunctionPrototype.constructor = GeneratorFunction;
    GeneratorFunctionPrototype[toStringTagSymbol] = GeneratorFunction.displayName =
      "GeneratorFunction";

    // Helper for defining the .next, .throw, and .return methods of the
    // Iterator interface in terms of a single ._invoke method.
    function defineIteratorMethods(prototype) {
      ["next", "throw", "return"].forEach(function (method) {
        prototype[method] = function (arg) {
          return this._invoke(method, arg);
        };
      });
    }

    exports.isGeneratorFunction = function (genFun) {
      var ctor = typeof genFun === "function" && genFun.constructor;
      return ctor
        ? ctor === GeneratorFunction ||
            // For the native GeneratorFunction constructor, the best we can
            // do is to check its .name property.
            (ctor.displayName || ctor.name) === "GeneratorFunction"
        : false;
    };

    exports.mark = function (genFun) {
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
      } else {
        genFun.__proto__ = GeneratorFunctionPrototype;
        if (!(toStringTagSymbol in genFun)) {
          genFun[toStringTagSymbol] = "GeneratorFunction";
        }
      }
      genFun.prototype = Object.create(Gp);
      return genFun;
    };

    // Within the body of any async function, `await x` is transformed to
    // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
    // `hasOwn.call(value, "__await")` to determine if the yielded value is
    // meant to be awaited.
    exports.awrap = function (arg) {
      return { __await: arg };
    };

    function AsyncIterator(generator) {
      function invoke(method, arg, resolve, reject) {
        var record = tryCatch(generator[method], generator, arg);
        if (record.type === "throw") {
          reject(record.arg);
        } else {
          var result = record.arg;
          var value = result.value;
          if (value && typeof value === "object" && hasOwn.call(value, "__await")) {
            return Promise.resolve(value.__await).then(
              function (value) {
                invoke("next", value, resolve, reject);
              },
              function (err) {
                invoke("throw", err, resolve, reject);
              }
            );
          }

          return Promise.resolve(value).then(
            function (unwrapped) {
              // When a yielded Promise is resolved, its final value becomes
              // the .value of the Promise<{value,done}> result for the
              // current iteration.
              result.value = unwrapped;
              resolve(result);
            },
            function (error) {
              // If a rejected Promise was yielded, throw the rejection back
              // into the async generator function so it can be handled there.
              return invoke("throw", error, resolve, reject);
            }
          );
        }
      }

      var previousPromise;

      function enqueue(method, arg) {
        function callInvokeWithMethodAndArg() {
          return new Promise(function (resolve, reject) {
            invoke(method, arg, resolve, reject);
          });
        }

        return (previousPromise =
          // If enqueue has been called before, then we want to wait until
          // all previous Promises have been resolved before calling invoke,
          // so that results are always delivered in the correct order. If
          // enqueue has not been called before, then it is important to
          // call invoke immediately, without waiting on a callback to fire,
          // so that the async generator function has the opportunity to do
          // any necessary setup in a predictable way. This predictability
          // is why the Promise constructor synchronously invokes its
          // executor callback, and why async functions synchronously
          // execute code before the first await. Since we implement simple
          // async functions in terms of async generators, it is especially
          // important to get this right, even though it requires care.
          previousPromise
            ? previousPromise.then(
                callInvokeWithMethodAndArg,
                // Avoid propagating failures to Promises returned by later
                // invocations of the iterator.
                callInvokeWithMethodAndArg
              )
            : callInvokeWithMethodAndArg());
      }

      // Define the unified helper method that is used to implement .next,
      // .throw, and .return (see defineIteratorMethods).
      this._invoke = enqueue;
    }

    defineIteratorMethods(AsyncIterator.prototype);
    AsyncIterator.prototype[asyncIteratorSymbol] = function () {
      return this;
    };
    exports.AsyncIterator = AsyncIterator;

    // Note that simple async functions are implemented on top of
    // AsyncIterator objects; they just return a Promise for the value of
    // the final result produced by the iterator.
    exports.async = function (innerFn, outerFn, self, tryLocsList) {
      var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList));

      return exports.isGeneratorFunction(outerFn)
        ? iter // If outerFn is a generator, return the full iterator.
        : iter.next().then(function (result) {
            return result.done ? result.value : iter.next();
          });
    };

    function makeInvokeMethod(innerFn, self, context) {
      var state = GenStateSuspendedStart;

      return function invoke(method, arg) {
        if (state === GenStateExecuting) {
          throw new Error("Generator is already running");
        }

        if (state === GenStateCompleted) {
          if (method === "throw") {
            throw arg;
          }

          // Be forgiving, per 25.3.3.3.3 of the spec:
          // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorresume
          return doneResult();
        }

        context.method = method;
        context.arg = arg;

        while (true) {
          var delegate = context.delegate;
          if (delegate) {
            var delegateResult = maybeInvokeDelegate(delegate, context);
            if (delegateResult) {
              if (delegateResult === ContinueSentinel) continue;
              return delegateResult;
            }
          }

          if (context.method === "next") {
            // Setting context._sent for legacy support of Babel's
            // function.sent implementation.
            context.sent = context._sent = context.arg;
          } else if (context.method === "throw") {
            if (state === GenStateSuspendedStart) {
              state = GenStateCompleted;
              throw context.arg;
            }

            context.dispatchException(context.arg);
          } else if (context.method === "return") {
            context.abrupt("return", context.arg);
          }

          state = GenStateExecuting;

          var record = tryCatch(innerFn, self, context);
          if (record.type === "normal") {
            // If an exception is thrown from innerFn, we leave state ===
            // GenStateExecuting and loop back for another invocation.
            state = context.done ? GenStateCompleted : GenStateSuspendedYield;

            if (record.arg === ContinueSentinel) {
              continue;
            }

            return {
              value: record.arg,
              done: context.done,
            };
          } else if (record.type === "throw") {
            state = GenStateCompleted;
            // Dispatch the exception by looping back around to the
            // context.dispatchException(context.arg) call above.
            context.method = "throw";
            context.arg = record.arg;
          }
        }
      };
    }

    // Call delegate.iterator[context.method](context.arg) and handle the
    // result, either by returning a { value, done } result from the
    // delegate iterator, or by modifying context.method and context.arg,
    // setting context.delegate to null, and returning the ContinueSentinel.
    function maybeInvokeDelegate(delegate, context) {
      var method = delegate.iterator[context.method];
      if (method === undefined$1) {
        // A .throw or .return when the delegate iterator has no .throw
        // method always terminates the yield* loop.
        context.delegate = null;

        if (context.method === "throw") {
          // Note: ["return"] must be used for ES3 parsing compatibility.
          if (delegate.iterator["return"]) {
            // If the delegate iterator has a return method, give it a
            // chance to clean up.
            context.method = "return";
            context.arg = undefined$1;
            maybeInvokeDelegate(delegate, context);

            if (context.method === "throw") {
              // If maybeInvokeDelegate(context) changed context.method from
              // "return" to "throw", let that override the TypeError below.
              return ContinueSentinel;
            }
          }

          context.method = "throw";
          context.arg = new TypeError("The iterator does not provide a 'throw' method");
        }

        return ContinueSentinel;
      }

      var record = tryCatch(method, delegate.iterator, context.arg);

      if (record.type === "throw") {
        context.method = "throw";
        context.arg = record.arg;
        context.delegate = null;
        return ContinueSentinel;
      }

      var info = record.arg;

      if (!info) {
        context.method = "throw";
        context.arg = new TypeError("iterator result is not an object");
        context.delegate = null;
        return ContinueSentinel;
      }

      if (info.done) {
        // Assign the result of the finished delegate to the temporary
        // variable specified by delegate.resultName (see delegateYield).
        context[delegate.resultName] = info.value;

        // Resume execution at the desired location (see delegateYield).
        context.next = delegate.nextLoc;

        // If context.method was "throw" but the delegate handled the
        // exception, let the outer generator proceed normally. If
        // context.method was "next", forget context.arg since it has been
        // "consumed" by the delegate iterator. If context.method was
        // "return", allow the original .return call to continue in the
        // outer generator.
        if (context.method !== "return") {
          context.method = "next";
          context.arg = undefined$1;
        }
      } else {
        // Re-yield the result returned by the delegate method.
        return info;
      }

      // The delegate iterator is finished, so forget it and continue with
      // the outer generator.
      context.delegate = null;
      return ContinueSentinel;
    }

    // Define Generator.prototype.{next,throw,return} in terms of the
    // unified ._invoke helper method.
    defineIteratorMethods(Gp);

    Gp[toStringTagSymbol] = "Generator";

    // A Generator should always return itself as the iterator object when the
    // @@iterator function is called on it. Some browsers' implementations of the
    // iterator prototype chain incorrectly implement this, causing the Generator
    // object to not be returned from this call. This ensures that doesn't happen.
    // See https://github.com/facebook/regenerator/issues/274 for more details.
    Gp[iteratorSymbol] = function () {
      return this;
    };

    Gp.toString = function () {
      return "[object Generator]";
    };

    function pushTryEntry(locs) {
      var entry = { tryLoc: locs[0] };

      if (1 in locs) {
        entry.catchLoc = locs[1];
      }

      if (2 in locs) {
        entry.finallyLoc = locs[2];
        entry.afterLoc = locs[3];
      }

      this.tryEntries.push(entry);
    }

    function resetTryEntry(entry) {
      var record = entry.completion || {};
      record.type = "normal";
      delete record.arg;
      entry.completion = record;
    }

    function Context(tryLocsList) {
      // The root entry object (effectively a try statement without a catch
      // or a finally block) gives us a place to store values thrown from
      // locations where there is no enclosing try statement.
      this.tryEntries = [{ tryLoc: "root" }];
      tryLocsList.forEach(pushTryEntry, this);
      this.reset(true);
    }

    exports.keys = function (object) {
      var keys = [];
      for (var key in object) {
        keys.push(key);
      }
      keys.reverse();

      // Rather than returning an object with a next method, we keep
      // things simple and return the next function itself.
      return function next() {
        while (keys.length) {
          var key = keys.pop();
          if (key in object) {
            next.value = key;
            next.done = false;
            return next;
          }
        }

        // To avoid creating an additional object, we just hang the .value
        // and .done properties off the next function object itself. This
        // also ensures that the minifier will not anonymize the function.
        next.done = true;
        return next;
      };
    };

    function values(iterable) {
      if (iterable) {
        var iteratorMethod = iterable[iteratorSymbol];
        if (iteratorMethod) {
          return iteratorMethod.call(iterable);
        }

        if (typeof iterable.next === "function") {
          return iterable;
        }

        if (!isNaN(iterable.length)) {
          var i = -1,
            next = function next() {
              while (++i < iterable.length) {
                if (hasOwn.call(iterable, i)) {
                  next.value = iterable[i];
                  next.done = false;
                  return next;
                }
              }

              next.value = undefined$1;
              next.done = true;

              return next;
            };

          return (next.next = next);
        }
      }

      // Return an iterator with no values.
      return { next: doneResult };
    }
    exports.values = values;

    function doneResult() {
      return { value: undefined$1, done: true };
    }

    Context.prototype = {
      constructor: Context,

      reset: function (skipTempReset) {
        this.prev = 0;
        this.next = 0;
        // Resetting context._sent for legacy support of Babel's
        // function.sent implementation.
        this.sent = this._sent = undefined$1;
        this.done = false;
        this.delegate = null;

        this.method = "next";
        this.arg = undefined$1;

        this.tryEntries.forEach(resetTryEntry);

        if (!skipTempReset) {
          for (var name in this) {
            // Not sure about the optimal order of these conditions:
            if (
              name.charAt(0) === "t" &&
              hasOwn.call(this, name) &&
              !isNaN(+name.slice(1))
            ) {
              this[name] = undefined$1;
            }
          }
        }
      },

      stop: function () {
        this.done = true;

        var rootEntry = this.tryEntries[0];
        var rootRecord = rootEntry.completion;
        if (rootRecord.type === "throw") {
          throw rootRecord.arg;
        }

        return this.rval;
      },

      dispatchException: function (exception) {
        if (this.done) {
          throw exception;
        }

        var context = this;
        function handle(loc, caught) {
          record.type = "throw";
          record.arg = exception;
          context.next = loc;

          if (caught) {
            // If the dispatched exception was caught by a catch block,
            // then let that catch block handle the exception normally.
            context.method = "next";
            context.arg = undefined$1;
          }

          return !!caught;
        }

        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          var record = entry.completion;

          if (entry.tryLoc === "root") {
            // Exception thrown outside of any try block that could handle
            // it, so set the completion value of the entire function to
            // throw the exception.
            return handle("end");
          }

          if (entry.tryLoc <= this.prev) {
            var hasCatch = hasOwn.call(entry, "catchLoc");
            var hasFinally = hasOwn.call(entry, "finallyLoc");

            if (hasCatch && hasFinally) {
              if (this.prev < entry.catchLoc) {
                return handle(entry.catchLoc, true);
              } else if (this.prev < entry.finallyLoc) {
                return handle(entry.finallyLoc);
              }
            } else if (hasCatch) {
              if (this.prev < entry.catchLoc) {
                return handle(entry.catchLoc, true);
              }
            } else if (hasFinally) {
              if (this.prev < entry.finallyLoc) {
                return handle(entry.finallyLoc);
              }
            } else {
              throw new Error("try statement without catch or finally");
            }
          }
        }
      },

      abrupt: function (type, arg) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (
            entry.tryLoc <= this.prev &&
            hasOwn.call(entry, "finallyLoc") &&
            this.prev < entry.finallyLoc
          ) {
            var finallyEntry = entry;
            break;
          }
        }

        if (
          finallyEntry &&
          (type === "break" || type === "continue") &&
          finallyEntry.tryLoc <= arg &&
          arg <= finallyEntry.finallyLoc
        ) {
          // Ignore the finally entry if control is not jumping to a
          // location outside the try/catch block.
          finallyEntry = null;
        }

        var record = finallyEntry ? finallyEntry.completion : {};
        record.type = type;
        record.arg = arg;

        if (finallyEntry) {
          this.method = "next";
          this.next = finallyEntry.finallyLoc;
          return ContinueSentinel;
        }

        return this.complete(record);
      },

      complete: function (record, afterLoc) {
        if (record.type === "throw") {
          throw record.arg;
        }

        if (record.type === "break" || record.type === "continue") {
          this.next = record.arg;
        } else if (record.type === "return") {
          this.rval = this.arg = record.arg;
          this.method = "return";
          this.next = "end";
        } else if (record.type === "normal" && afterLoc) {
          this.next = afterLoc;
        }

        return ContinueSentinel;
      },

      finish: function (finallyLoc) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.finallyLoc === finallyLoc) {
            this.complete(entry.completion, entry.afterLoc);
            resetTryEntry(entry);
            return ContinueSentinel;
          }
        }
      },

      catch: function (tryLoc) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.tryLoc === tryLoc) {
            var record = entry.completion;
            if (record.type === "throw") {
              var thrown = record.arg;
              resetTryEntry(entry);
            }
            return thrown;
          }
        }

        // The context.catch method must only be called with a location
        // argument that corresponds to a known catch block.
        throw new Error("illegal catch attempt");
      },

      delegateYield: function (iterable, resultName, nextLoc) {
        this.delegate = {
          iterator: values(iterable),
          resultName: resultName,
          nextLoc: nextLoc,
        };

        if (this.method === "next") {
          // Deliberately forget the last sent value so that we don't
          // accidentally pass it on to the delegate.
          this.arg = undefined$1;
        }

        return ContinueSentinel;
      },
    };

    // Regardless of whether this script is executing as a CommonJS module
    // or not, return the runtime object so that we can declare the variable
    // regeneratorRuntime in the outer scope, which allows this module to be
    // injected easily by `bin/regenerator --include-runtime script.js`.
    return exports;
  })(
    // If this script is executing as a CommonJS module, use module.exports
    // as the regeneratorRuntime namespace. Otherwise create a new empty
    // object. Either way, the resulting object will be used to initialize
    // the regeneratorRuntime variable at the top of this file.
    module.exports
  );

  try {
    regeneratorRuntime = runtime;
  } catch (accidentalStrictMode) {
    // This module should not be running in strict mode, so the above
    // assignment should always work unless something is misconfigured. Just
    // in case runtime.js accidentally runs in strict mode, we can escape
    // strict mode using a global Function call. This could conceivably fail
    // if a Content Security Policy forbids using Function, but in that case
    // the proper solution is to fix the accidental strict mode problem. If
    // you've misconfigured your bundler to force strict mode and applied a
    // CSP to forbid Function, and you're not willing to fix either of those
    // problems, please detail your unique predicament in a GitHub issue.
    Function("r", "regeneratorRuntime = r")(runtime);
  }
});

var regenerator = runtime_1;

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
  try {
    var info = gen[key](arg);
    var value = info.value;
  } catch (error) {
    reject(error);
    return;
  }

  if (info.done) {
    resolve(value);
  } else {
    Promise.resolve(value).then(_next, _throw);
  }
}

function _asyncToGenerator(fn) {
  return function () {
    var self = this,
      args = arguments;
    return new Promise(function (resolve, reject) {
      var gen = fn.apply(self, args);

      function _next(value) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
      }

      function _throw(err) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
      }

      _next(undefined);
    });
  };
}

var asyncToGenerator = _asyncToGenerator;

function doRequest(_ref) {
  var method = _ref.method,
    path = _ref.path,
    _ref$body = _ref.body,
    body = _ref$body === void 0 ? null : _ref$body,
    _ref$headers = _ref.headers,
    headers = _ref$headers === void 0 ? {} : _ref$headers;
  var options = {
    method: method,
    headers: headers,
  };

  if (body !== null) {
    options.body = JSON.stringify(body);
    options.headers = objectSpread(
      {
        "Content-Type": "application/json",
      },
      headers
    );
  }

  return fetch(path, options).then(
    /*#__PURE__*/
    (function () {
      var _ref2 = asyncToGenerator(
        /*#__PURE__*/
        regenerator.mark(function _callee(response) {
          return regenerator.wrap(
            function _callee$(_context) {
              while (1) {
                switch ((_context.prev = _context.next)) {
                  case 0:
                    if (response.ok) {
                      _context.next = 3;
                      break;
                    }

                    _context.next = 3;
                    return handleError(response);

                  case 3:
                    _context.prev = 3;
                    _context.next = 6;
                    return response.json();

                  case 6:
                    return _context.abrupt("return", _context.sent);

                  case 9:
                    _context.prev = 9;
                    _context.t0 = _context["catch"](3);
                    return _context.abrupt("return", null);

                  case 12:
                  case "end":
                    return _context.stop();
                }
              }
            },
            _callee,
            null,
            [[3, 9]]
          );
        })
      );

      return function (_x) {
        return _ref2.apply(this, arguments);
      };
    })()
  );
}

function handleError(_x2) {
  return _handleError.apply(this, arguments);
}

function _handleError() {
  _handleError = asyncToGenerator(
    /*#__PURE__*/
    regenerator.mark(function _callee2(response) {
      var errorMessage, _ref3, _ref3$error, error, _ref3$description, description;

      return regenerator.wrap(
        function _callee2$(_context2) {
          while (1) {
            switch ((_context2.prev = _context2.next)) {
              case 0:
                _context2.prev = 0;
                _context2.next = 3;
                return response.json();

              case 3:
                _ref3 = _context2.sent;
                _ref3$error = _ref3.error;
                error = _ref3$error === void 0 ? "Unknown error" : _ref3$error;
                _ref3$description = _ref3.description;
                description =
                  _ref3$description === void 0 ? "No description" : _ref3$description;
                errorMessage = "Unexpected status code "
                  .concat(response.status, ": ")
                  .concat(error, ", ")
                  .concat(description);
                _context2.next = 14;
                break;

              case 11:
                _context2.prev = 11;
                _context2.t0 = _context2["catch"](0);
                errorMessage = "Unexpected status code ".concat(
                  response.status,
                  ": Cannot parse error response"
                );

              case 14:
                throw new Error(errorMessage);

              case 15:
              case "end":
                return _context2.stop();
            }
          }
        },
        _callee2,
        null,
        [[0, 11]]
      );
    })
  );
  return _handleError.apply(this, arguments);
}

function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}

var classCallCheck = _classCallCheck;

function _defineProperties(target, props) {
  for (var i = 0; i < props.length; i++) {
    var descriptor = props[i];
    descriptor.enumerable = descriptor.enumerable || false;
    descriptor.configurable = true;
    if ("value" in descriptor) descriptor.writable = true;
    Object.defineProperty(target, descriptor.key, descriptor);
  }
}

function _createClass(Constructor, protoProps, staticProps) {
  if (protoProps) _defineProperties(Constructor.prototype, protoProps);
  if (staticProps) _defineProperties(Constructor, staticProps);
  return Constructor;
}

var createClass = _createClass;

var DeviceStateStore =
  /*#__PURE__*/
  (function () {
    function DeviceStateStore(instanceId) {
      classCallCheck(this, DeviceStateStore);

      this._instanceId = instanceId;
      this._dbConn = null;
    }

    createClass(DeviceStateStore, [
      {
        key: "connect",
        value: function connect() {
          var _this = this;

          return new Promise(function (resolve, reject) {
            var request = indexedDB.open(_this._dbName);

            request.onsuccess = function (event) {
              var db = event.target.result;
              _this._dbConn = db;

              _this
                ._readState()
                .then(function (state) {
                  return state === null ? _this.clear() : Promise.resolve();
                })
                .then(resolve);
            };

            request.onupgradeneeded = function (event) {
              var db = event.target.result;
              db.createObjectStore("beams", {
                keyPath: "instance_id",
              });
            };

            request.onerror = function (event) {
              var error = new Error("Database error: ".concat(event.target.error));
              reject(error);
            };
          });
        },
      },
      {
        key: "clear",
        value: function clear() {
          return this._writeState({
            instance_id: this._instanceId,
            device_id: null,
            token: null,
            user_id: null,
          });
        },
      },
      {
        key: "_readState",
        value: function _readState() {
          var _this2 = this;

          if (!this.isConnected) {
            throw new Error(
              "Cannot read value: DeviceStateStore not connected to IndexedDB"
            );
          }

          return new Promise(function (resolve, reject) {
            var request = _this2._dbConn
              .transaction("beams")
              .objectStore("beams")
              .get(_this2._instanceId);

            request.onsuccess = function (event) {
              var state = event.target.result;

              if (!state) {
                resolve(null);
              }

              resolve(state);
            };

            request.onerror = function (event) {
              reject(event.target.error);
            };
          });
        },
      },
      {
        key: "_readProperty",
        value: (function () {
          var _readProperty2 = asyncToGenerator(
            /*#__PURE__*/
            regenerator.mark(function _callee(name) {
              var state;
              return regenerator.wrap(
                function _callee$(_context) {
                  while (1) {
                    switch ((_context.prev = _context.next)) {
                      case 0:
                        _context.next = 2;
                        return this._readState();

                      case 2:
                        state = _context.sent;

                        if (!(state === null)) {
                          _context.next = 5;
                          break;
                        }

                        return _context.abrupt("return", null);

                      case 5:
                        return _context.abrupt("return", state[name] || null);

                      case 6:
                      case "end":
                        return _context.stop();
                    }
                  }
                },
                _callee,
                this
              );
            })
          );

          function _readProperty(_x) {
            return _readProperty2.apply(this, arguments);
          }

          return _readProperty;
        })(),
      },
      {
        key: "_writeState",
        value: function _writeState(state) {
          var _this3 = this;

          if (!this.isConnected) {
            throw new Error(
              "Cannot write value: DeviceStateStore not connected to IndexedDB"
            );
          }

          return new Promise(function (resolve, reject) {
            var request = _this3._dbConn
              .transaction("beams", "readwrite")
              .objectStore("beams")
              .put(state);

            request.onsuccess = function (_) {
              resolve();
            };

            request.onerror = function (event) {
              reject(event.target.error);
            };
          });
        },
      },
      {
        key: "_writeProperty",
        value: (function () {
          var _writeProperty2 = asyncToGenerator(
            /*#__PURE__*/
            regenerator.mark(function _callee2(name, value) {
              var state;
              return regenerator.wrap(
                function _callee2$(_context2) {
                  while (1) {
                    switch ((_context2.prev = _context2.next)) {
                      case 0:
                        _context2.next = 2;
                        return this._readState();

                      case 2:
                        state = _context2.sent;
                        state[name] = value;
                        _context2.next = 6;
                        return this._writeState(state);

                      case 6:
                      case "end":
                        return _context2.stop();
                    }
                  }
                },
                _callee2,
                this
              );
            })
          );

          function _writeProperty(_x2, _x3) {
            return _writeProperty2.apply(this, arguments);
          }

          return _writeProperty;
        })(),
      },
      {
        key: "getToken",
        value: function getToken() {
          return this._readProperty("token");
        },
      },
      {
        key: "setToken",
        value: function setToken(token) {
          return this._writeProperty("token", token);
        },
      },
      {
        key: "getDeviceId",
        value: function getDeviceId() {
          return this._readProperty("device_id");
        },
      },
      {
        key: "setDeviceId",
        value: function setDeviceId(deviceId) {
          return this._writeProperty("device_id", deviceId);
        },
      },
      {
        key: "getUserId",
        value: function getUserId() {
          return this._readProperty("user_id");
        },
      },
      {
        key: "setUserId",
        value: function setUserId(userId) {
          return this._writeProperty("user_id", userId);
        },
      },
      {
        key: "getLastSeenSdkVersion",
        value: function getLastSeenSdkVersion() {
          return this._readProperty("last_seen_sdk_version");
        },
      },
      {
        key: "setLastSeenSdkVersion",
        value: function setLastSeenSdkVersion(sdkVersion) {
          return this._writeProperty("last_seen_sdk_version", sdkVersion);
        },
      },
      {
        key: "getLastSeenUserAgent",
        value: function getLastSeenUserAgent() {
          return this._readProperty("last_seen_user_agent");
        },
      },
      {
        key: "setLastSeenUserAgent",
        value: function setLastSeenUserAgent(userAgent) {
          return this._writeProperty("last_seen_user_agent", userAgent);
        },
      },
      {
        key: "_dbName",
        get: function get() {
          return "beams-".concat(this._instanceId);
        },
      },
      {
        key: "isConnected",
        get: function get() {
          return this._dbConn !== null;
        },
      },
    ]);

    return DeviceStateStore;
  })();

self.PusherPushNotifications = {
  endpointOverride: null,
  onNotificationReceived: null,
  _endpoint: function _endpoint(instanceId) {
    return self.PusherPushNotifications.endpointOverride
      ? self.PusherPushNotifications.endpointOverride
      : "https://".concat(instanceId, ".pushnotifications.pusher.com");
  },
  _getVisibleClient: function _getVisibleClient() {
    return self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(function (clients) {
        return clients.find(function (c) {
          return c.visibilityState === "visible";
        });
      });
  },
  _hasVisibleClient: function _hasVisibleClient() {
    return self.PusherPushNotifications._getVisibleClient().then(function (client) {
      return client !== undefined;
    });
  },
  _getFocusedClient: function _getFocusedClient() {
    return self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(function (clients) {
        return clients.find(function (c) {
          return c.focused === true;
        });
      });
  },
  _hasFocusedClient: function _hasFocusedClient() {
    return self.PusherPushNotifications._getFocusedClient().then(function (client) {
      return client !== undefined;
    });
  },
  reportEvent: (function () {
    var _reportEvent = asyncToGenerator(
      /*#__PURE__*/
      regenerator.mark(function _callee(_ref) {
        var eventType,
          pusherMetadata,
          instanceId,
          publishId,
          hasDisplayableContent,
          hasData,
          deviceStateStore,
          deviceId,
          userId,
          appInBackground,
          path,
          options;
        return regenerator.wrap(
          function _callee$(_context) {
            while (1) {
              switch ((_context.prev = _context.next)) {
                case 0:
                  (eventType = _ref.eventType), (pusherMetadata = _ref.pusherMetadata);
                  (instanceId = pusherMetadata.instanceId),
                    (publishId = pusherMetadata.publishId),
                    (hasDisplayableContent = pusherMetadata.hasDisplayableContent),
                    (hasData = pusherMetadata.hasData);

                  if (!(!instanceId || !publishId)) {
                    _context.next = 4;
                    break;
                  }

                  return _context.abrupt("return");

                case 4:
                  deviceStateStore = new DeviceStateStore(instanceId);
                  _context.next = 7;
                  return deviceStateStore.connect();

                case 7:
                  _context.next = 9;
                  return deviceStateStore.getDeviceId();

                case 9:
                  deviceId = _context.sent;
                  _context.next = 12;
                  return deviceStateStore.getUserId();

                case 12:
                  _context.t0 = _context.sent;

                  if (_context.t0) {
                    _context.next = 15;
                    break;
                  }

                  _context.t0 = null;

                case 15:
                  userId = _context.t0;
                  _context.next = 18;
                  return self.PusherPushNotifications._hasVisibleClient();

                case 18:
                  appInBackground = !_context.sent;
                  path = ""
                    .concat(
                      self.PusherPushNotifications._endpoint(instanceId),
                      "/reporting_api/v2/instances/"
                    )
                    .concat(instanceId, "/events");
                  options = {
                    method: "POST",
                    path: path,
                    body: {
                      publishId: publishId,
                      event: eventType,
                      deviceId: deviceId,
                      userId: userId,
                      timestampSecs: Math.floor(Date.now() / 1000),
                      appInBackground: appInBackground,
                      hasDisplayableContent: hasDisplayableContent,
                      hasData: hasData,
                    },
                  };
                  _context.prev = 21;
                  _context.next = 24;
                  return doRequest(options);

                case 24:
                  _context.next = 28;
                  break;

                case 26:
                  _context.prev = 26;
                  _context.t1 = _context["catch"](21);

                case 28:
                case "end":
                  return _context.stop();
              }
            }
          },
          _callee,
          null,
          [[21, 26]]
        );
      })
    );

    function reportEvent(_x) {
      return _reportEvent.apply(this, arguments);
    }

    return reportEvent;
  })(),
};
self.addEventListener("push", function (e) {
  var payload;

  try {
    payload = e.data.json();
  } catch (_) {
    return; // Not a pusher notification
  }

  if (!payload.data || !payload.data.pusher) {
    return; // Not a pusher notification
  } // Report analytics event, best effort

  self.PusherPushNotifications.reportEvent({
    eventType: "delivery",
    pusherMetadata: payload.data.pusher,
  });

  var customerPayload = objectSpread({}, payload);

  var customerData = {};
  Object.keys(customerPayload.data || {}).forEach(function (key) {
    if (key !== "pusher") {
      customerData[key] = customerPayload.data[key];
    }
  });
  customerPayload.data = customerData;
  var pusherMetadata = payload.data.pusher;

  var handleNotification =
    /*#__PURE__*/
    (function () {
      var _ref2 = asyncToGenerator(
        /*#__PURE__*/
        regenerator.mark(function _callee2(payloadFromCallback) {
          var hideNotificationIfSiteHasFocus, title, body, icon, options;
          return regenerator.wrap(function _callee2$(_context2) {
            while (1) {
              switch ((_context2.prev = _context2.next)) {
                case 0:
                  hideNotificationIfSiteHasFocus =
                    payloadFromCallback.notification
                      .hide_notification_if_site_has_focus === true;
                  _context2.t0 = hideNotificationIfSiteHasFocus;

                  if (!_context2.t0) {
                    _context2.next = 6;
                    break;
                  }

                  _context2.next = 5;
                  return self.PusherPushNotifications._hasFocusedClient();

                case 5:
                  _context2.t0 = _context2.sent;

                case 6:
                  if (!_context2.t0) {
                    _context2.next = 8;
                    break;
                  }

                  return _context2.abrupt("return");

                case 8:
                  title = payloadFromCallback.notification.title || "";
                  body = payloadFromCallback.notification.body || "";
                  icon = payloadFromCallback.notification.icon;
                  options = {
                    body: body,
                    icon: icon,
                    data: {
                      pusher: {
                        customerPayload: payloadFromCallback,
                        pusherMetadata: pusherMetadata,
                      },
                    },
                  };
                  return _context2.abrupt(
                    "return",
                    self.registration.showNotification(title, options)
                  );

                case 13:
                case "end":
                  return _context2.stop();
              }
            }
          }, _callee2);
        })
      );

      return function handleNotification(_x2) {
        return _ref2.apply(this, arguments);
      };
    })();

  if (self.PusherPushNotifications.onNotificationReceived) {
    self.PusherPushNotifications.onNotificationReceived({
      payload: customerPayload,
      pushEvent: e,
      handleNotification: handleNotification,
    });
  } else {
    e.waitUntil(handleNotification(customerPayload));
  }
});
self.addEventListener("notificationclick", function (e) {
  var pusher = e.notification.data.pusher;
  var isPusherNotification = pusher !== undefined;

  if (isPusherNotification) {
    // Report analytics event, best effort
    self.PusherPushNotifications.reportEvent({
      eventType: "open",
      pusherMetadata: pusher.pusherMetadata,
    });

    if (pusher.customerPayload.notification.deep_link) {
      e.waitUntil(clients.openWindow(pusher.customerPayload.notification.deep_link));
    }

    e.notification.close();
  }
});
