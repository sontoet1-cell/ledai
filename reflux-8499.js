"use strict";
(self["webpackChunkweb_activities_domestic"] = self["webpackChunkweb_activities_domestic"] || []).push([[8499],{

/***/ 1867:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  L: () => (/* binding */ ServiceRegistry)
});

// UNUSED EXPORTS: InstantiationType

// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/assert/assert.js
var assert = __webpack_require__(85968);
// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/descriptor.js
var descriptor = __webpack_require__(2132);
// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/service-collection.js
var service_collection = __webpack_require__(16007);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/service-ownership-collection.js
var ServiceOwnership;
(function(ServiceOwnership2) {
  ServiceOwnership2[ServiceOwnership2["Owned"] = 1] = "Owned";
  ServiceOwnership2[ServiceOwnership2["Reference"] = 2] = "Reference";
})(ServiceOwnership || (ServiceOwnership = {}));
class ServiceOwnershipCollection {
  get entries() {
    return this._entries;
  }
  set(id, ownership) {
    this._entries.set(id, ownership);
  }
  has(id) {
    return this._entries.has(id);
  }
  get(id) {
    return this._entries.get(id);
  }
  constructor(...entries) {
    this._entries = /* @__PURE__ */ new Map();
    for (const [id, service] of entries) {
      this.set(id, service);
    }
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/service-registry.js




var InstantiationType;
(function(InstantiationType2) {
  InstantiationType2[InstantiationType2["Eager"] = 0] = "Eager";
  InstantiationType2[InstantiationType2["Delayed"] = 1] = "Delayed";
})(InstantiationType || (InstantiationType = {}));
class ServiceRegistry {
  get registry() {
    return this._registry;
  }
  register(id, ctorOrDescriptor, supportsDelayedInstantiation) {
    if (!(ctorOrDescriptor instanceof descriptor/* SyncDescriptor */.d)) {
      ctorOrDescriptor = new descriptor/* SyncDescriptor */.d(ctorOrDescriptor, [], Boolean(supportsDelayedInstantiation));
    }
    if (this._checkDuplicate) {
      (0,assert/* lvAssert */.X3)(!this._ids.has(id.toString()), `service: ${id.toString()} duplicate register.`);
      this._ids.add(id.toString());
    }
    this._registry.push([
      id,
      ctorOrDescriptor
    ]);
  }
  /**
  * 直接注册一个服务的实例
  *
  * 注意：谨慎使用，优先使用register
  * 一般用于特殊场景：需要先于DI之前就构造了某个service
  */
  registerInstance(id, instance, options) {
    if (this._checkDuplicate) {
      (0,assert/* lvAssert */.X3)(!this._ids.has(id.toString()), `service: ${id.toString()} duplicate register.`);
      this._ids.add(id.toString());
    }
    this._registry.push([
      id,
      instance
    ]);
    var _options_ownership;
    this._serviceOwnership.set(id, (_options_ownership = options === null || options === void 0 ? void 0 : options.ownership) !== null && _options_ownership !== void 0 ? _options_ownership : ServiceOwnership.Owned);
  }
  makeCollection() {
    const serviceCollection = new service_collection/* ServiceCollection */.a({
      ownership: this._serviceOwnership
    });
    for (const [id, instanceOrDescriptor] of this.registry) {
      serviceCollection.set(id, instanceOrDescriptor);
    }
    return serviceCollection;
  }
  constructor(config = {}) {
    this._registry = [];
    this._serviceOwnership = new ServiceOwnershipCollection();
    this._ids = /* @__PURE__ */ new Set();
    var _config_checkDuplicate;
    this._checkDuplicate = (_config_checkDuplicate = config.checkDuplicate) !== null && _config_checkDuplicate !== void 0 ? _config_checkDuplicate : false;
  }
}



/***/ }),

/***/ 2132:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   d: () => (/* binding */ SyncDescriptor)
/* harmony export */ });
class SyncDescriptor {
  constructor(ctor, staticArguments = [], supportsDelayedInstantiation = false) {
    this.ctor = ctor;
    this.staticArguments = staticArguments;
    this.supportsDelayedInstantiation = supportsDelayedInstantiation;
  }
}



/***/ }),

/***/ 9017:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  v: () => (/* binding */ Emitter)
});

// UNUSED EXPORTS: EventDeliveryQueue

// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/dispose/disposable-t.js + 3 modules
var disposable_t = __webpack_require__(82262);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/dispose/disposable-utils.js



function makeSafeDisposable(fn) {
  const disposable = new disposable_t/* SafeDisposable */.St({
    dispose: fn
  });
  return disposable;
}
function makeEmptyDisposable() {
  return EmptyDispose;
}
function ignoreDispose(x) {
  MARK_AS_LEAKED(x);
}
function isDisposable(thing) {
  return typeof thing.dispose === "function" && thing.dispose.length === 0;
}
function makeTransferDisposable(val) {
  return new TransferDisposable(val);
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/structure/linked-list.js
class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
    this.prev = null;
  }
}
class LinkedList {
  get size() {
    return this._size;
  }
  get firstNode() {
    return this._first;
  }
  isEmpty() {
    return this._first === null;
  }
  clear() {
    let node = this._first;
    while (node !== null) {
      const { next } = node;
      node.prev = null;
      node.next = null;
      node = next;
    }
    this._first = null;
    this._last = null;
    this._size = 0;
  }
  unshift(value) {
    const newNode = new Node(value);
    if (this._first === null) {
      this._first = newNode;
      this._last = newNode;
    } else {
      const temp = this._first;
      this._first = newNode;
      newNode.next = temp;
      temp.prev = newNode;
    }
    this._size++;
    return this;
  }
  push(value) {
    const newNode = new Node(value);
    if (this._last === null) {
      this._first = newNode;
      this._last = newNode;
    } else {
      const temp = this._last;
      this._last = newNode;
      newNode.prev = temp;
      temp.next = newNode;
    }
    this._size++;
    return this;
  }
  shift() {
    if (this._first === null) {
      return null;
    } else {
      const res = this._first.value;
      this._remove(this._first);
      return res;
    }
  }
  pop() {
    if (this._last === null) {
      return null;
    } else {
      const res = this._last.value;
      this._remove(this._last);
      return res;
    }
  }
  toArray() {
    const nodes = [];
    for (const node of this) {
      nodes.push(node);
    }
    return nodes;
  }
  *[Symbol.iterator]() {
    let node = this._first;
    while (node !== null) {
      yield node.value;
      node = node.next;
    }
  }
  _remove(node) {
    if (node.prev !== null && node.next !== null) {
      const temp = node.prev;
      temp.next = node.next;
      node.next.prev = temp;
    } else if (node.prev === null && node.next === null) {
      this._first = null;
      this._last = null;
    } else if (node.next === null) {
      this._last = this._last.prev;
      this._last.next = null;
    } else if (node.prev === null) {
      this._first = this._first.next;
      this._first.prev = null;
    }
    this._size -= 1;
  }
  constructor() {
    this._first = null;
    this._last = null;
    this._size = 0;
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/event/disposable-linked-list.js

class DisposableLinkedList extends LinkedList {
  unshiftAndGetDisposableNode(value) {
    this.unshift(value);
    const node = this._first;
    let hasRemoved = false;
    return () => {
      if (!hasRemoved) {
        hasRemoved = true;
        super._remove(node);
      }
    };
  }
  pushAndGetDisposableNode(value) {
    this.push(value);
    const node = this._last;
    let hasRemoved = false;
    return () => {
      if (!hasRemoved) {
        hasRemoved = true;
        super._remove(node);
      }
    };
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/event/error-handler.js
function asyncUnexpectedError(e) {
  setTimeout(() => {
    throw e;
  }, 0);
}
function syncUnexpectedError(e) {
  throw e;
}
function ignoreUnexpectedError(e) {
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/event/emitter.js



class Listener {
  invoke(...args) {
    this._callback.call(this._callbackThis, ...args);
  }
  constructor(callback, callbackThis) {
    this._callback = callback;
    this._callbackThis = callbackThis;
  }
}
class EventDeliveryQueueElement {
  constructor(emitter, listener, event) {
    this.emitter = emitter;
    this.listener = listener;
    this.event = event;
  }
}
class EventDeliveryQueue {
  get size() {
    return this._queue.size;
  }
  push(emitter, listener, event) {
    this._queue.push(new EventDeliveryQueueElement(emitter, listener, event));
  }
  clear(emitter) {
    const newQueue = new DisposableLinkedList();
    for (const element of this._queue) {
      if (element.emitter !== emitter) {
        newQueue.push(element);
      }
    }
    this._queue = newQueue;
  }
  deliver() {
    while (this._queue.size > 0) {
      const element = this._queue.shift();
      try {
        element.listener.invoke(...element.event);
      } catch (e) {
        this._onListenerError(e);
      }
    }
  }
  constructor(_onListenerError = asyncUnexpectedError) {
    this._onListenerError = _onListenerError;
    this._queue = new DisposableLinkedList();
  }
}
class Emitter {
  get event() {
    if (this._event) {
      return this._event;
    }
    this._event = (callback, thisArgs) => {
      var _this__options;
      const listener = new Listener(callback, thisArgs);
      if (!this._listeners) {
        this._listeners = new DisposableLinkedList();
      }
      const removeListener = this._listeners.pushAndGetDisposableNode(listener);
      if ((_this__options = this._options) === null || _this__options === void 0 ? void 0 : _this__options.onAddListener) {
        this._options.onAddListener(this, callback, thisArgs);
      }
      const result = () => {
        if (!this._disposed) {
          var _this__options2;
          removeListener();
          if ((_this__options2 = this._options) === null || _this__options2 === void 0 ? void 0 : _this__options2.onRemoveListener) {
            this._options.onRemoveListener(this, callback, thisArgs);
          }
        }
      };
      return makeSafeDisposable(result);
    };
    return this._event;
  }
  dispose() {
    var _this__listeners, _this__deliveryQueue;
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    (_this__listeners = this._listeners) === null || _this__listeners === void 0 ? void 0 : _this__listeners.clear();
    (_this__deliveryQueue = this._deliveryQueue) === null || _this__deliveryQueue === void 0 ? void 0 : _this__deliveryQueue.clear(this);
  }
  fire(...event) {
    var _this__options;
    if (!this._listeners || this._listeners.size === 0) {
      return;
    }
    if (this._listeners.size === 1) {
      const listener = this._listeners.firstNode;
      try {
        listener.value.invoke(...event);
      } catch (e) {
        var _this__options1;
        if ((_this__options1 = this._options) === null || _this__options1 === void 0 ? void 0 : _this__options1.onListenerError) {
          this._options.onListenerError(e);
        } else {
          asyncUnexpectedError(e);
        }
      }
      return;
    }
    var _this__deliveryQueue;
    (_this__deliveryQueue = this._deliveryQueue) !== null && _this__deliveryQueue !== void 0 ? _this__deliveryQueue : this._deliveryQueue = new EventDeliveryQueue((_this__options = this._options) === null || _this__options === void 0 ? void 0 : _this__options.onListenerError);
    for (const listener of this._listeners) {
      this._deliveryQueue.push(this, listener, event);
    }
    this._deliveryQueue.deliver();
  }
  constructor(options) {
    this._disposed = false;
    this._options = options;
  }
}



/***/ }),

/***/ 15164:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  f: () => (/* binding */ ColorAnalyzeService),
  A: () => (/* binding */ IColorAnalyzeService)
});

// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/base.js
var base = __webpack_require__(80436);
// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/dispose/disposable-t.js + 3 modules
var disposable_t = __webpack_require__(82262);
// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/assert/assert.js
var assert = __webpack_require__(85968);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/event/once.js
function listenOnce(event) {
  return (listener, thisArgs = null) => {
    let didFire = false;
    let result = void 0;
    result = event((...args) => {
      if (didFire) {
        return;
      } else if (result) {
        result.dispose();
      } else {
        didFire = true;
      }
      return listener.call(thisArgs, ...args);
    }, null);
    if (didFire) {
      result.dispose();
    }
    return result;
  };
}


// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/event/emitter.js + 4 modules
var emitter = __webpack_require__(9017);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/lock/capability.js


var CapabilityStatus;
(function(CapabilityStatus2) {
  CapabilityStatus2[CapabilityStatus2["Unlocked"] = 0] = "Unlocked";
  CapabilityStatus2[CapabilityStatus2["Locked"] = 1] = "Locked";
})(CapabilityStatus || (CapabilityStatus = {}));
class Capability {
  get status() {
    return this._status;
  }
  acquire() {
    (0,assert/* lvAssert */.X3)(this._status === 0);
    this._status = 1;
  }
  release() {
    (0,assert/* lvAssert */.X3)(this._status === 1);
    this._status = 0;
    this._onUnlocked.fire();
  }
  constructor() {
    this._onUnlocked = new emitter/* Emitter */.v();
    this._status = 0;
    this.onUnlocked = this._onUnlocked.event;
  }
}
class SharedCapability {
  get status() {
    return this._status;
  }
  get counter() {
    return this._counter;
  }
  acquire() {
    if (this._status === 0) {
      this._status = 1;
    }
    this._counter++;
  }
  release() {
    (0,assert/* lvAssert */.X3)(this._counter > 0);
    this._counter--;
    if (this._counter === 0) {
      this._status = 0;
      this._onUnlocked.fire();
    }
  }
  constructor() {
    this._onUnlocked = new emitter/* Emitter */.v();
    this._status = 0;
    this._counter = 0;
    this.onUnlocked = this._onUnlocked.event;
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/lock/semaphore.js

class Semaphore {
  notify() {
    this._onActive.fire();
  }
  constructor() {
    this._onActive = new emitter/* Emitter */.v();
    this.onActive = this._onActive.event;
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/lock/shared-mutex.js




class SharedMutex {
  /**
  * 是否被锁住
  */
  isLocked() {
    return this._writer || this._readerCount !== 0;
  }
  /**
  * 等待并获取写锁
  */
  lock() {
    return new Promise((resolve) => {
      if (this._writer) {
        const token = new Semaphore();
        this._waitingWriters.push(token);
        token.onActive(() => {
          this._writerEnterGate1(resolve);
        });
      } else {
        this._writerEnterGate1(resolve);
      }
    });
  }
  /**
  * 尝试获取写锁，立刻返回结果
  */
  tryLock() {
    if (this._writer || this._readerCount > 0) {
      return false;
    }
    this.lock();
    return true;
  }
  /**
  * 解除写锁
  */
  unLock() {
    (0,assert/* lvAssertNotNil */.F4)(this._writer);
    this._writer.release();
  }
  /**
  * 等待并获取读锁
  */
  lockShared() {
    return new Promise((resolve) => {
      if (this._writer) {
        if (!this._waitingReader) {
          this._waitingReader = new Semaphore();
        }
        this._waitingReader.onActive(() => {
          this._readerEnterGate1(resolve);
        });
      } else {
        this._readerEnterGate1(resolve);
      }
    });
  }
  /**
  * 尝试获取读锁，立刻返回结果
  */
  tryLockShared() {
    if (this._writer) {
      return false;
    }
    this.lockShared();
    return true;
  }
  /**
  * 解除读锁
  */
  unLockShared() {
    (0,assert/* lvAssertNotNil */.F4)(this._reader);
    if (this._writer) {
      (0,assert/* lvAssert */.X3)(this._writer.status === CapabilityStatus.Unlocked);
    }
    this._reader.release();
  }
  /**
  * 获取当前读者数量
  */
  get _readerCount() {
    return this._reader ? this._reader.counter : 0;
  }
  /**
  * 写者进入第一道门
  */
  _writerEnterGate1(resolve) {
    (0,assert/* lvAssert */.X3)(!this._writer);
    this._writer = new Capability();
    if (this._readerCount > 0) {
      listenOnce(this._reader.onUnlocked)(() => {
        this._writerEnterGate2(resolve);
      });
    } else {
      this._writerEnterGate2(resolve);
    }
  }
  /**
  * 写者进入第二道门
  */
  _writerEnterGate2(resolve) {
    (0,assert/* lvAssertNotNil */.F4)(this._writer);
    (0,assert/* lvAssert */.X3)(this._readerCount === 0);
    this._writer.acquire();
    listenOnce(this._writer.onUnlocked)(() => {
      (0,assert/* lvAssertNotNil */.F4)(this._writer);
      this._writer = void 0;
      this._moveForward();
    });
    resolve();
  }
  /**
  * 读者进入第一道门
  */
  _readerEnterGate1(resolve) {
    (0,assert/* lvAssert */.X3)(!this._writer);
    this._waitingReader = void 0;
    if (!this._reader) {
      this._reader = new SharedCapability();
      this._reader.acquire();
      listenOnce(this._reader.onUnlocked)(() => {
        this._moveForward();
      });
    } else {
      this._reader.acquire();
    }
    resolve();
  }
  /**
  * 锁释放时推进流程
  */
  _moveForward() {
    if (this._writer) {
      return;
    }
    if (this._waitingWriters.length > 0) {
      const semaphore = this._waitingWriters.shift();
      semaphore.notify();
      return;
    }
    if (this._waitingReader) {
      this._waitingReader.notify();
    }
  }
  constructor() {
    this._waitingWriters = [];
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/worker/cors-worker.js
class CorsWorker {
  getWorker() {
    return this._worker;
  }
  dispose() {
    this._worker.terminate();
  }
  constructor(url) {
    const absoluteUrl = new URL(url, window.location.href).toString();
    const workerSource = `	const urlString = ${JSON.stringify(absoluteUrl)}
	const originURL = new URL(urlString)
	const originalImportScripts = self.importScripts
	self.importScripts = (url) => originalImportScripts.call(self, new URL(url, originURL).toString())
	importScripts(urlString);
	`;
    const blob = new Blob([
      workerSource
    ], {
      type: "application/javascript"
    });
    const objectURL = URL.createObjectURL(blob);
    this._worker = new Worker(objectURL);
    URL.revokeObjectURL(objectURL);
  }
}


// EXTERNAL MODULE: ../../node_modules/.pnpm/@swc+helpers@0.5.18/node_modules/@swc/helpers/esm/_object_spread.js
var _object_spread = __webpack_require__(77371);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/uuid/uuid.js
const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value) {
  return pattern.test(value);
}
const generateUuid = (() => {
  if (typeof crypto === "object" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID.bind(crypto);
  }
  let getRandomValues;
  if (typeof crypto === "object" && typeof crypto.getRandomValues === "function") {
    getRandomValues = crypto.getRandomValues.bind(crypto);
  } else {
    getRandomValues = function(bucket) {
      for (let i = 0; i < bucket.length; i++) {
        bucket[i] = Math.floor(Math.random() * 256);
      }
      return bucket;
    };
  }
  const data = new Uint8Array(16);
  const hex = [];
  for (let i = 0; i < 256; i++) {
    hex.push(i.toString(16).padStart(2, "0"));
  }
  return () => {
    getRandomValues(data);
    data[6] = data[6] & 15 | 64;
    data[8] = data[8] & 63 | 128;
    let i = 0;
    let result = "";
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += "-";
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += "-";
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += "-";
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += "-";
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += hex[data[i++]];
    result += hex[data[i++]];
    return result;
  };
})();
const generateUpperCaseUuid = () => generateUuid().toUpperCase();
const uuid = generateUuid;
const upperCaseUuid = (/* unused pure expression or super */ null && (generateUpperCaseUuid));


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/promise/promise.js


function makeCancelablePromise(callback) {
  const source = new CancellationTokenSource();
  const thenable = callback(source.token);
  const promise = new Promise((resolve, reject) => {
    const subscription = source.token.onCancellationRequested(() => {
      subscription.dispose();
      source.dispose();
      resolve(cancelledError());
    });
    Promise.resolve(thenable).then((value) => {
      subscription.dispose();
      source.dispose();
      if (isLvErrorRef(value)) {
        resolve(value);
      } else {
        resolve(makeOkWith(value));
      }
    }, (err) => {
      subscription.dispose();
      source.dispose();
      reject(err);
    });
  });
  return new class {
    cancel() {
      source.cancel();
    }
    then(resolve, reject) {
      return promise.then(resolve, reject);
    }
    catch(reject) {
      return this.then(void 0, reject);
    }
    finally(onfinally) {
      return promise.finally(onfinally);
    }
  }();
}
function parallelPromise(promiseList) {
  if (promiseList.length === 0) {
    return Promise.resolve(makeOk());
  }
  let todo = promiseList.length;
  const finish = () => {
    todo = -1;
    for (const promise of promiseList) {
      var _promise_cancel;
      (_promise_cancel = promise.cancel) === null || _promise_cancel === void 0 ? void 0 : _promise_cancel.call(promise);
    }
  };
  return new Promise((resolve, reject) => {
    for (const promise of promiseList) {
      promise.then((res) => {
        if (isLvErrorRef(res) && !res.ok) {
          finish();
          resolve(res);
          return;
        }
        todo--;
        if (todo === 0) {
          resolve(makeOk());
        }
      }).catch((err) => {
        finish();
        reject(err);
      });
    }
  });
}
function makePromiseWithTimeout(callback, timeout, defaultValue) {
  const cancellable = makeCancelablePromise(callback);
  const timer = setTimeout(() => {
    cancellable.cancel();
  }, timeout);
  return cancellable.then((res) => {
    clearTimeout(timer);
    if (res.ok) {
      return res;
    }
    if (res.code === GenericError.Cancelled) {
      if (defaultValue !== void 0) {
        return makeOkWith(defaultValue);
      }
      return timeoutError();
    } else {
      return res;
    }
  });
}
function defer() {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return {
    resolve,
    reject,
    promise
  };
}
function waitForAbortSignal(signal) {
  const { promise, reject } = defer();
  if (signal.aborted) {
    reject(signal.reason);
  }
  const handleAbort = () => {
    reject(signal.reason);
    signal.removeEventListener("abort", handleAbort);
  };
  signal.addEventListener("abort", handleAbort);
  return promise;
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/error/error-t.js

const lvErrorRefSymbol = Symbol("lvErrorRef");
function findJsError(error) {
  let obj = error;
  while (obj) {
    if (obj instanceof Error) {
      return obj;
    }
    obj = obj.cause;
  }
  return new Error(error.toString());
}
function error_t_makeOk() {
  return (0,_object_spread._)({
    ok: true,
    value: null,
    pair() {
      return [
        null,
        null
      ];
    },
    code: 0,
    msg: ""
  }, {
    [lvErrorRefSymbol]: true
  });
}
function error_t_makeOkWith(value) {
  return (0,_object_spread._)({
    ok: true,
    value,
    pair() {
      return [
        null,
        value
      ];
    },
    code: 0,
    msg: ""
  }, {
    [lvErrorRefSymbol]: true
  });
}
function printCause(cause) {
  if (cause === void 0) {
    return "";
  } else if (cause instanceof Error) {
    return `
caused by [jsError]${cause.name}-${cause.message}`;
  } else {
    return `
caused by [${cause.code}]${cause.msg}${cause.ok ? "" : printCause(cause.cause)}`;
  }
}
function internalMakeError(code, msg, cause, errorInfo) {
  const errorRef = (0,_object_spread._)({
    ok: false,
    code,
    msg,
    cause,
    errorInfo,
    toString() {
      return `[${code}]${msg}.${cause ? printCause(cause) : ""}`;
    },
    pair() {
      return [
        errorRef,
        null
      ];
    },
    stack: cause instanceof Error ? cause.stack : void 0,
    findJsError: () => findJsError(errorRef)
  }, {
    [lvErrorRefSymbol]: true
  });
  return errorRef;
}
function makeError(code, msg, errorInfo) {
  return internalMakeError(code, msg, void 0, errorInfo);
}
function makeErrorBy(code, msg, cause, errorInfo) {
  return internalMakeError(code, msg, cause, errorInfo);
}
function error_t_isLvErrorRef(val) {
  return typeof val === "object" && val !== null && lvErrorRefSymbol in val;
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/worker/promise-worker-main-thread.js





class PromiseWorkerMainThread {
  /**
  * 将任务下派给 worker 并等待其返回
  * - 由于 worker 本身运行在独立线程中，所以没必要专门为其设计任务执行队列.
  * */
  sendTaskToWorker(req = {}) {
    const taskDefer = defer();
    const worker = this._worker;
    const id = uuid();
    this._deferMap.set(id, taskDefer);
    worker.postMessage((0,_object_spread._)({
      pid: id
    }, req));
    return taskDefer.promise;
  }
  _receiveWorkerMsgHandler(res) {
    if (!res) {
      return;
    }
    if (!this._check(res)) {
      return;
    }
    const { pid, code, msg, data } = res;
    const task = this._deferMap.get(pid);
    (0,assert/* lvAssert */.X3)(task, `task-${pid} is not defined`);
    if (code === 0) {
      if (!data) {
        task.resolve(error_t_makeOk());
      } else {
        task.resolve(error_t_makeOkWith(data));
      }
    } else {
      task.resolve(makeError(code, msg !== null && msg !== void 0 ? msg : "no message error."));
    }
    this._deferMap.delete(pid);
  }
  _check(res) {
    if (!res) {
      return false;
    }
    const keyMap = [
      "pid"
    ];
    if (keyMap.map((key) => key in res).includes(false)) {
      return false;
    }
    return true;
  }
  constructor(_worker) {
    var _worker_onmessage;
    this._worker = _worker;
    this._deferMap = /* @__PURE__ */ new Map();
    const preMessageHandler = (_worker_onmessage = _worker.onmessage) === null || _worker_onmessage === void 0 ? void 0 : _worker_onmessage.bind(_worker);
    this._worker.onmessage = (event) => {
      preMessageHandler === null || preMessageHandler === void 0 ? void 0 : preMessageHandler(event);
      this._receiveWorkerMsgHandler(event === null || event === void 0 ? void 0 : event.data);
    };
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-service-color-analyze@0.1.2_@byted-image+lv-bedrock@1.4.0/node_modules/@byted-image/lv-service-color-analyze/dist/es/index.js
// src/color-analyze.interface.ts

var IColorAnalyzeService = (0,base/* createDecorator */.u1)("color-analyze");

// src/color-analyze.ts




// src/worker/worker.interface.ts
var ColorWorkerAnalyzeType;
(function(ColorWorkerAnalyzeType2) {
  ColorWorkerAnalyzeType2["Env"] = "env";
  ColorWorkerAnalyzeType2["Average"] = "average";
})(ColorWorkerAnalyzeType || (ColorWorkerAnalyzeType = {}));

// src/color-analyze.ts

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
function _async_to_generator(fn) {
  return function() {
    var self = this, args = arguments;
    return new Promise(function(resolve, reject) {
      var gen = fn.apply(self, args);
      function _next(value) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
      }
      function _throw(err) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
      }
      _next(void 0);
    });
  };
}
function getImageDataByUrl(url) {
  return _getImageDataByUrl.apply(this, arguments);
}
function _getImageDataByUrl() {
  _getImageDataByUrl = _async_to_generator(function* (url) {
    const response = yield fetch(url, {
      referrer: location.origin
    });
    const imageBitmap = yield createImageBitmap(yield response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
    return imageData;
  });
  return _getImageDataByUrl.apply(this, arguments);
}
var ColorAnalyzeService = class extends disposable_t/* Disposable */.jG {
  getAverageColor(source, options) {
    var _this = this;
    return _async_to_generator(function* () {
      if (!_this._worker) {
        const corsWorker = _this._store.add(new CorsWorker(_this._workUrl));
        _this._worker = new PromiseWorkerMainThread(corsWorker.getWorker());
        _this._mutex = new SharedMutex();
      }
      if (typeof source !== "string") {
        return _this._getAverageColorByImageData(source, options);
      }
      yield _this._ensureEnv();
      if (_this._canvasInWorker === false) {
        try {
          const imageData = yield getImageDataByUrl(source);
          return _this._getAverageColorByImageData(imageData, options);
        } catch (e) {
          return makeErrorBy(-1, "getImageDataByUrl in main thread error", e);
        }
      }
      return _this._getAverageColorByUrl(source, options);
    })();
  }
  _getAverageColorByUrl(url, options) {
    var _options_quality;
    return this._worker.sendTaskToWorker({
      data: {
        event: ColorWorkerAnalyzeType.Average,
        source: url,
        quality: (_options_quality = options === null || options === void 0 ? void 0 : options.quality) !== null && _options_quality !== void 0 ? _options_quality : 1
      }
    });
  }
  _getAverageColorByImageData(imageData, options) {
    var _options_quality;
    return this._worker.sendTaskToWorker({
      data: {
        event: ColorWorkerAnalyzeType.Average,
        source: imageData,
        quality: (_options_quality = options === null || options === void 0 ? void 0 : options.quality) !== null && _options_quality !== void 0 ? _options_quality : 1
      }
    });
  }
  _ensureEnv() {
    var _this = this;
    return _async_to_generator(function* () {
      if (_this._canvasInWorker !== void 0) {
        return;
      }
      if (!_this._mutex.tryLock()) {
        yield _this._mutex.lockShared();
        _this._mutex.unLockShared();
        return;
      }
      const result = yield _this._worker.sendTaskToWorker({
        data: {
          event: ColorWorkerAnalyzeType.Env
        }
      });
      if (result.ok) {
        _this._canvasInWorker = result.value.offscreenCanvas;
      } else {
        _this._canvasInWorker = false;
      }
    })();
  }
  constructor(_workUrl) {
    super(), this._workUrl = _workUrl;
  }
};



/***/ }),

/***/ 16007:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   a: () => (/* binding */ ServiceCollection)
/* harmony export */ });
class ServiceCollection {
  get entries() {
    return this._entries;
  }
  get ownerships() {
    var _this__ownership;
    return (_this__ownership = this._ownership) === null || _this__ownership === void 0 ? void 0 : _this__ownership.entries;
  }
  set(id, instanceOrDescriptor) {
    this._entries.set(id, instanceOrDescriptor);
  }
  has(id) {
    return this._entries.has(id);
  }
  get(id) {
    return this._entries.get(id);
  }
  constructor(options) {
    this._entries = /* @__PURE__ */ new Map();
    for (const [id, service] of (options === null || options === void 0 ? void 0 : options.entries) || []) {
      this.set(id, service);
    }
    if (options === null || options === void 0 ? void 0 : options.ownership) {
      this._ownership = options.ownership;
    }
  }
}



/***/ }),

/***/ 18144:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   V: () => (/* binding */ Logger)
/* harmony export */ });
const Logger = {
  error(...data) {
    if (typeof console.error === "function") {
      console.error(...data);
    }
  },
  info(...data) {
    if (typeof console.info === "function") {
      console.info(...data);
    }
  },
  log(...data) {
    if (typeof console.log === "function") {
      console.log(...data);
    }
  },
  time(label) {
    if (typeof console.time === "function") {
      console.time(label);
    }
  },
  timeEnd(label) {
    if (typeof console.timeEnd === "function") {
      console.timeEnd(label);
    }
  },
  timeLog(label, ...data) {
    if (typeof console.timeLog === "function") {
      console.timeLog(label, ...data);
    }
  },
  timeStamp(label) {
    if (typeof console.timeStamp === "function") {
      console.timeStamp(label);
    }
  },
  trace(...data) {
    if (typeof console.trace === "function") {
      console.trace(...data);
    }
  },
  warn(...data) {
    if (typeof console.warn === "function") {
      console.warn(...data);
    }
  },
  profile(label) {
    if (typeof console.profile === "function") {
      console.profile(label);
    }
  },
  profileEnd(label) {
    if (typeof console.profileEnd === "function") {
      console.profileEnd(label);
    }
  }
};



/***/ }),

/***/ 39919:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  n: () => (/* binding */ InstantiationService)
});

// UNUSED EXPORTS: InstantiationErrorType

// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/assert/assert.js
var assert = __webpack_require__(85968);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/core/task.js

class Task {
  getCallback() {
    return this._callback;
  }
  setCallback(callback) {
    (0,assert/* lvAssert */.X3)(this._callback === void 0, "cant overlay callback.");
    this._callback = callback;
  }
  clearCallback() {
    this._callback = void 0;
  }
  getStartTime() {
    return this._startTime;
  }
  setStartTime(startTime) {
    this._startTime = startTime;
  }
  getExpirationTime() {
    return this._expirationTime;
  }
  setExpirationTime(expirationTime) {
    this._expirationTime = expirationTime;
  }
  setSortIndex(index) {
    this._sortIndex = index;
  }
  getSortIndex() {
    return this._sortIndex;
  }
  constructor(callback, _startTime, _expirationTime) {
    this._startTime = _startTime;
    this._expirationTime = _expirationTime;
    this._sortIndex = -1;
    this._callback = callback;
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/type.js
var PriorityLevel;
(function(PriorityLevel2) {
  PriorityLevel2[PriorityLevel2["ImmediatePriority"] = 0] = "ImmediatePriority";
  PriorityLevel2[PriorityLevel2["UserBlockingPriority"] = 1] = "UserBlockingPriority";
  PriorityLevel2[PriorityLevel2["NormalPriority"] = 2] = "NormalPriority";
  PriorityLevel2[PriorityLevel2["LowPriority"] = 3] = "LowPriority";
  PriorityLevel2[PriorityLevel2["IdlePriority"] = 4] = "IdlePriority";
})(PriorityLevel || (PriorityLevel = {}));


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/core/utils.js


const maxSigned31BitInt = 1073741823;
const IMMEDIATE_PRIORITY_TIMEOUT = -1;
const USER_BLOCKING_PRIORITY_TIMEOUT = 250;
const NORMAL_PRIORITY_TIMEOUT = 5e3;
const LOW_PRIORITY_TIMEOUT = 1e4;
const IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt;
function getCurrentTime() {
  return Date.now();
}
function getTimeout(priorityLevel = PriorityLevel.NormalPriority) {
  switch (priorityLevel) {
    case PriorityLevel.ImmediatePriority:
      return IMMEDIATE_PRIORITY_TIMEOUT;
    case PriorityLevel.UserBlockingPriority:
      return USER_BLOCKING_PRIORITY_TIMEOUT;
    case PriorityLevel.IdlePriority:
      return IDLE_PRIORITY_TIMEOUT;
    case PriorityLevel.LowPriority:
      return LOW_PRIORITY_TIMEOUT;
    case PriorityLevel.NormalPriority:
    default:
      return NORMAL_PRIORITY_TIMEOUT;
  }
}
function makeTask(callback, options = {}) {
  const currentTime = getCurrentTime();
  var _options_delay;
  const delay = (_options_delay = options.delay) !== null && _options_delay !== void 0 ? _options_delay : 0;
  const timeout = getTimeout(options.priorityLevel);
  const startTime = delay + currentTime;
  const expirationTime = startTime + timeout;
  const newTask = new Task(callback, startTime, expirationTime);
  return newTask;
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/core/chunk-scheduler.js

class ChunkScheduler {
  get needContinue() {
    return this._needContinue;
  }
  continueExecute(callback) {
    this._needContinue = true;
    this._task.setCallback(callback);
  }
  execute(callback, options = {}) {
    const newTask = makeTask(callback, options);
    this._scheduler.addTask(newTask);
  }
  constructor(_task, _scheduler) {
    this._task = _task;
    this._scheduler = _scheduler;
    this._needContinue = false;
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/core/actuator.js


class Actuator {
  workLoop(hasTimeRemaining, initialTime, deadline) {
    let currentTime = initialTime;
    this._taskQueue.advance(currentTime);
    let currentTask = this._taskQueue.waitingTasks.peek();
    while (currentTask !== null) {
      if (currentTask.getExpirationTime() > currentTime && (!hasTimeRemaining || this._scheduler.shouldYieldToHost(deadline))) {
        break;
      }
      if (currentTask.getCallback() === void 0) {
        this._taskQueue.waitingTasks.remove();
      } else {
        const callback = currentTask.getCallback();
        const didUserCallbackTimeout = currentTask.getExpirationTime() <= currentTime;
        const remainingTime = deadline - currentTime;
        currentTask.clearCallback();
        const chunkInvoker = new ChunkScheduler(currentTask, this._scheduler);
        callback(chunkInvoker, didUserCallbackTimeout, remainingTime);
        if (!chunkInvoker.needContinue) {
          this._taskQueue.waitingTasks.remove();
        }
        currentTime = getCurrentTime();
        this._taskQueue.advance(currentTime);
      }
      currentTask = this._taskQueue.waitingTasks.peek();
    }
    if (currentTask !== null) {
      return true;
    }
    this._scheduler.requestHostTimeout(currentTime);
    return false;
  }
  constructor(_taskQueue, _scheduler) {
    this._taskQueue = _taskQueue;
    this._scheduler = _scheduler;
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/structure/min-heap.js
class MinHeap {
  insert(value) {
    this._heap.push(value);
    this._siftUp();
  }
  peek() {
    return this._heap.length > 0 ? this._heap[0] : null;
  }
  remove() {
    if (this._heap.length === 0)
      return null;
    if (this._heap.length === 1)
      return this._heap.pop();
    const item = this._heap[0];
    this._heap[0] = this._heap.pop();
    this._siftDown();
    return item;
  }
  size() {
    return this._heap.length;
  }
  clear() {
    this._heap.length = 0;
  }
  _getLeftChildIndex(parentIndex) {
    return 2 * parentIndex + 1;
  }
  _getRightChildIndex(parentIndex) {
    return 2 * parentIndex + 2;
  }
  _getParentIndex(childIndex) {
    return Math.floor((childIndex - 1) / 2);
  }
  _swap(indexOne, indexTwo) {
    [this._heap[indexOne], this._heap[indexTwo]] = [
      this._heap[indexTwo],
      this._heap[indexOne]
    ];
  }
  _siftUp() {
    let index = this._heap.length - 1;
    while (index > 0 && this._compare(this._heap[this._getParentIndex(index)], this._heap[index]) > 0) {
      const parentIndex = this._getParentIndex(index);
      this._swap(index, parentIndex);
      index = parentIndex;
    }
  }
  _siftDown() {
    let index = 0;
    let smallerChildIndex = this._getLeftChildIndex(index);
    while (smallerChildIndex < this._heap.length) {
      const rightChildIndex = this._getRightChildIndex(index);
      if (rightChildIndex < this._heap.length && this._compare(this._heap[rightChildIndex], this._heap[smallerChildIndex]) < 0) {
        smallerChildIndex = rightChildIndex;
      }
      if (this._compare(this._heap[index], this._heap[smallerChildIndex]) <= 0) {
        break;
      }
      this._swap(index, smallerChildIndex);
      index = smallerChildIndex;
      smallerChildIndex = this._getLeftChildIndex(index);
    }
  }
  constructor(compareFunction) {
    this._heap = [];
    if (compareFunction) {
      this._compare = compareFunction;
    } else {
      this._compare = (a, b) => {
        if (a < b)
          return -1;
        if (a > b)
          return 1;
        return 0;
      };
    }
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/core/task-queue.js

function compare(lhs, rhs) {
  return lhs.getSortIndex() - rhs.getSortIndex();
}
class TaskQueue {
  get timerTasks() {
    return this._timerTasks;
  }
  get waitingTasks() {
    return this._waitingTasks;
  }
  advance(currentTime) {
    let task = this._timerTasks.peek();
    while (task !== null) {
      if (task.getCallback() === null) {
        this._timerTasks.remove();
      } else if (task.getStartTime() <= currentTime) {
        this._timerTasks.remove();
        task.setSortIndex(task.getExpirationTime());
        this._waitingTasks.insert(task);
      } else {
        return;
      }
      task = this._timerTasks.peek();
    }
  }
  constructor() {
    this._timerTasks = new MinHeap(compare);
    this._waitingTasks = new MinHeap(compare);
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/executor/abstract-executor.js

class AbstractExecutor {
  get deadline() {
    return this._deadline;
  }
  setFrameRate(fps) {
    (0,assert/* lvAssert */.X3)(fps > 0 && fps <= 125);
    this._yieldInterval = Math.floor(1e3 / fps);
  }
  resetFrameRate() {
    this._yieldInterval = 16;
  }
  requestHostTimeout(fn, delayMs) {
    (0,assert/* lvAssert */.X3)(this._timeoutId === -1, "has request host timeout.");
    clearTimeout(this._timeoutId);
    this._timeoutId = setTimeout(() => {
      this._timeoutId = -1;
      fn();
    }, delayMs);
  }
  cancelHostTimeout() {
    clearTimeout(this._timeoutId);
    this._timeoutId = -1;
  }
  constructor() {
    this._timeoutId = -1;
    this._deadline = 0;
    this._yieldInterval = 16;
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/executor/idle-callback-executor.js


class IdleCallbackExecutor extends AbstractExecutor {
  requestHostCallback(fn) {
    this._scheduledCallback = fn;
    if (!this._disposable) {
      this._disposable = this._runWhenIdle(this._flushCallback);
    }
  }
  cancelHostCallback() {
    var _this__disposable;
    (_this__disposable = this._disposable) === null || _this__disposable === void 0 ? void 0 : _this__disposable.dispose();
    this._scheduledCallback = void 0;
    this._disposable = void 0;
  }
  constructor() {
    super(), this._flushCallback = () => {
      if (!this._scheduledCallback) {
        return;
      }
      const currentTime = getCurrentTime();
      const deadline = currentTime + this._yieldInterval;
      try {
        const hasMoreWork = this._scheduledCallback(true, currentTime, deadline);
        if (!hasMoreWork) {
          this._scheduledCallback = void 0;
          this._disposable = void 0;
        } else {
          this._disposable = this._runWhenIdle(this._flushCallback);
        }
      } catch (err) {
        this._disposable = this._runWhenIdle(this._flushCallback);
        throw err;
      }
    };
    if (typeof requestIdleCallback !== "function" || typeof cancelIdleCallback !== "function") {
      this._runWhenIdle = (runner) => {
        let disposed = false;
        setTimeout(() => {
          if (disposed) {
            return;
          }
          const end = Date.now() + 15;
          runner(Object.freeze({
            didTimeout: true,
            timeRemaining() {
              return Math.max(0, end - Date.now());
            }
          }));
        });
        return {
          dispose() {
            if (disposed) {
              return;
            }
            disposed = true;
          }
        };
      };
    } else {
      this._runWhenIdle = (runner, timeout) => {
        const handle = requestIdleCallback(runner, typeof timeout === "number" ? {
          timeout
        } : void 0);
        let disposed = false;
        return {
          dispose() {
            if (disposed) {
              return;
            }
            disposed = true;
            cancelIdleCallback(handle);
          }
        };
      };
    }
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/executor/post-message-executor.js


class PostMessageExecutor extends AbstractExecutor {
  requestHostCallback(fn) {
    this._scheduledCallback = fn;
    if (!this._isMessageLoopRunning) {
      this._isMessageLoopRunning = true;
      this._channel.port2.postMessage(null);
    }
  }
  cancelHostCallback() {
    this._scheduledCallback = void 0;
  }
  constructor() {
    super(), this._isMessageLoopRunning = false, this._channel = new MessageChannel(), this._flushCallback = () => {
      if (!this._scheduledCallback) {
        this._isMessageLoopRunning = false;
        return;
      }
      const currentTime = getCurrentTime();
      const deadline = currentTime + this._yieldInterval;
      try {
        const hasMoreWork = this._scheduledCallback(true, currentTime, deadline);
        if (!hasMoreWork) {
          this._isMessageLoopRunning = false;
          this._scheduledCallback = void 0;
        } else {
          this._channel.port2.postMessage(null);
        }
      } catch (err) {
        this._channel.port2.postMessage(null);
        throw err;
      }
    };
    this._channel.port1.onmessage = () => {
      this._flushCallback();
    };
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/executor/make-executor.js


function makeExecutor() {
  try {
    if (__webpack_require__.g.window) {
      return new PostMessageExecutor();
    }
  } catch (e) {
  }
  return new IdleCallbackExecutor();
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/core/scheduler.js





class Scheduler {
  get taskQueue() {
    return this._taskQueue;
  }
  get executor() {
    return this._executor;
  }
  /**
  * 设置是否开启InputPending
  */
  setEnableInputPending(val) {
    this._enableInputPending = val;
  }
  /**
  * 调度器中添加任务
  */
  addTask(task) {
    const currentTime = getCurrentTime();
    if (task.getStartTime() > currentTime) {
      task.setSortIndex(task.getStartTime());
      this._taskQueue.timerTasks.insert(task);
      if (this._taskQueue.waitingTasks.peek() === null && task === this._taskQueue.timerTasks.peek()) {
        if (this._isHostTimeoutScheduled) {
          this._executor.cancelHostTimeout();
        } else {
          this._isHostTimeoutScheduled = true;
        }
        this._executor.requestHostTimeout(this._handleHostTimeout, task.getStartTime() - currentTime);
      }
    } else {
      task.setSortIndex(task.getExpirationTime());
      this._taskQueue.waitingTasks.insert(task);
      if (!this._isHostCallbackScheduled && !this._isWorking) {
        this._isHostCallbackScheduled = true;
        this._executor.requestHostCallback(this._handleHostCallback);
      }
    }
  }
  /**
  * 尝试启动异步任务调度
  */
  requestHostTimeout(currentTime) {
    this._requestHostTimeout(currentTime);
  }
  _requestHostTimeout(currentTime) {
    (0,assert/* lvAssert */.X3)(!this._isHostCallbackScheduled);
    (0,assert/* lvAssert */.X3)(!this._isHostTimeoutScheduled);
    const firstTimerTask = this._taskQueue.timerTasks.peek();
    if (firstTimerTask !== null) {
      this._isHostTimeoutScheduled = true;
      this._executor.requestHostTimeout(this._handleHostTimeout, firstTimerTask.getStartTime() - currentTime);
    }
  }
  constructor() {
    this._isHostTimeoutScheduled = false;
    this._isHostCallbackScheduled = false;
    this._isWorking = false;
    this._enableInputPending = true;
    this._executor = makeExecutor();
    this._taskQueue = new TaskQueue();
    this._actuator = new Actuator(this._taskQueue, this);
    this.shouldYieldToHost = (() => {
      try {
        var _global_navigator_scheduling, _global_navigator;
        if (((_global_navigator = __webpack_require__.g.navigator) === null || _global_navigator === void 0 ? void 0 : (_global_navigator_scheduling = _global_navigator.scheduling) === null || _global_navigator_scheduling === void 0 ? void 0 : _global_navigator_scheduling.isInputPending) !== void 0) {
          const { scheduling } = __webpack_require__.g.navigator;
          return (deadline) => {
            if (this._enableInputPending && scheduling.isInputPending()) {
              return true;
            }
            return getCurrentTime() >= deadline;
          };
        }
      } catch (e) {
      }
      return (deadline) => {
        return getCurrentTime() >= deadline;
      };
    })();
    this._handleHostTimeout = () => {
      this._isHostTimeoutScheduled = false;
      const currentTime = getCurrentTime();
      this._taskQueue.advance(currentTime);
      if (this._isHostCallbackScheduled) {
        return;
      }
      if (this._taskQueue.waitingTasks.peek() !== null) {
        this._isHostCallbackScheduled = true;
        this._executor.requestHostCallback(this._handleHostCallback);
        return;
      }
      this._requestHostTimeout(currentTime);
    };
    this._handleHostCallback = (hasTimeRemaining, initialTime, deadline) => {
      this._isHostCallbackScheduled = false;
      if (this._isHostTimeoutScheduled) {
        this._isHostTimeoutScheduled = false;
        this._executor.cancelHostTimeout();
      }
      this._isWorking = true;
      try {
        return this._actuator.workLoop(hasTimeRemaining, initialTime, deadline);
      } finally {
        this._isWorking = false;
      }
    };
  }
}
let scheduler;
function getScheduler() {
  if (!scheduler) {
    scheduler = new Scheduler();
  }
  return scheduler;
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/callback-token.js


class CallbackToken {
  dispose() {
    this._task.clearCallback();
  }
  updatePriorityLevel(priorityLevel) {
    const callback = this._task.getCallback();
    if (!callback) {
      return;
    }
    this._task.clearCallback();
    const newTask = makeTask(callback, {
      priorityLevel
    });
    const startTime = this._task.getStartTime();
    const timeout = getTimeout(priorityLevel);
    const expirationTime = startTime + timeout;
    newTask.setStartTime(startTime);
    newTask.setExpirationTime(expirationTime);
    getScheduler().addTask(newTask);
    this._task = newTask;
  }
  constructor(_task) {
    this._task = _task;
  }
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/scheduler/lv-scheduler-callback.js



function lvSchedulerCallback(callback, options = {}) {
  const newTask = makeTask(callback, options);
  getScheduler().addTask(newTask);
  return new CallbackToken(newTask);
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/idle-value.js

class IdleValue {
  get value() {
    if (!this._didRun) {
      this._handle.dispose();
      this._executor();
    }
    if (this._error) {
      throw this._error;
    }
    return this._value;
  }
  get isInitialized() {
    return this._didRun;
  }
  dispose() {
    this._handle.dispose();
  }
  constructor(executor) {
    this._didRun = false;
    this._executor = () => {
      try {
        this._value = executor();
      } catch (err) {
        this._error = err;
      } finally {
        this._didRun = true;
      }
    };
    this._handle = lvSchedulerCallback(() => this._executor(), {
      priorityLevel: PriorityLevel.IdlePriority
    });
  }
}


// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/descriptor.js
var descriptor = __webpack_require__(2132);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/structure/graph.js
class Node {
  constructor(key, data) {
    this.key = key;
    this.data = data;
    this.incoming = /* @__PURE__ */ new Map();
    this.outgoing = /* @__PURE__ */ new Map();
  }
}
class Graph {
  // 寻找所有的叶子节点
  leafs() {
    const ret = [];
    for (const node of this._nodes.values()) {
      if (node.outgoing.size === 0) {
        ret.push(node);
      }
    }
    return ret;
  }
  // 插入一条边
  insertEdge(from, to) {
    const fromNode = this.lookupOrInsertNode(from);
    const toNode = this.lookupOrInsertNode(to);
    fromNode.outgoing.set(toNode.key, toNode);
    toNode.incoming.set(fromNode.key, fromNode);
  }
  // 移除某个节点
  removeNode(data) {
    const key = this._hashFn(data);
    this._nodes.delete(key);
    for (const node of this._nodes.values()) {
      node.outgoing.delete(key);
      node.incoming.delete(key);
    }
  }
  // 查找某个节点
  lookup(data) {
    return this._nodes.get(this._hashFn(data));
  }
  // 查找某个节点，不存在则插入
  lookupOrInsertNode(data) {
    const key = this._hashFn(data);
    let node = this._nodes.get(key);
    if (!node) {
      node = new Node(key, data);
      this._nodes.set(key, node);
    }
    return node;
  }
  isEmpty() {
    return this._nodes.size === 0;
  }
  toString() {
    const data = [];
    for (const [key, value] of this._nodes) {
      data.push(`${key}
	(-> incoming)[${[
        ...value.incoming.keys()
      ].join(", ")}]
	(outgoing ->)[${[
        ...value.outgoing.keys()
      ].join(",")}]
`);
    }
    return data.join("\n");
  }
  findCycleSlow() {
    for (const [id, node] of this._nodes) {
      const seen = /* @__PURE__ */ new Set([
        id
      ]);
      const res = this._findCycle(node, seen);
      if (res) {
        return res;
      }
    }
    return void 0;
  }
  _findCycle(node, seen) {
    for (const [id, outgoing] of node.outgoing) {
      if (seen.has(id)) {
        return [
          ...seen,
          id
        ].join(" -> ");
      }
      seen.add(id);
      const value = this._findCycle(outgoing, seen);
      if (value) {
        return value;
      }
      seen.delete(id);
    }
    return void 0;
  }
  constructor(_hashFn) {
    this._hashFn = _hashFn;
    this._nodes = /* @__PURE__ */ new Map();
  }
}


// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/service-collection.js
var service_collection = __webpack_require__(16007);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/proxy-builder.js
function makeProxy(valueWrapper) {
  return new Proxy(/* @__PURE__ */ Object.create(null), {
    get(target, key) {
      if (key in target) {
        return target[key];
      }
      const obj = valueWrapper.value;
      let prop = obj[key];
      if (typeof prop !== "function") {
        return prop;
      }
      prop = prop.bind(obj);
      target[key] = prop;
      return prop;
    },
    set(_target, p, value) {
      const obj = valueWrapper.value;
      obj[p] = value;
      return true;
    }
  });
}


// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/base.js
var base = __webpack_require__(80436);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/instantiation-service.interface.js

const IInstantiationService = (0,base/* createDecorator */.u1)("instantiation");


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/trace.js
var TraceType;
(function(TraceType2) {
  TraceType2[TraceType2["None"] = 0] = "None";
  TraceType2[TraceType2["Creation"] = 1] = "Creation";
  TraceType2[TraceType2["Invocation"] = 2] = "Invocation";
  TraceType2[TraceType2["Branch"] = 3] = "Branch";
})(TraceType || (TraceType = {}));
class Trace {
  static traceInvocation(_enableTracing, ctor) {
    return !_enableTracing ? Trace._None : new Trace(2, ctor.name || new Error().stack.split("\n").slice(3, 4).join("\n"));
  }
  static traceCreation(_enableTracing, ctor) {
    return !_enableTracing ? Trace._None : new Trace(1, ctor.name);
  }
  branch(id, first) {
    const child = new Trace(3, id.toString());
    this._dep.push([
      id,
      first,
      child
    ]);
    return child;
  }
  stop() {
    const dur = Date.now() - this._start;
    Trace._totals += dur;
    let causedCreation = false;
    function printChild(n, trace) {
      const res = [];
      const prefix = new Array(n + 1).join("	");
      for (const [id, first, child] of trace._dep) {
        if (first && child) {
          causedCreation = true;
          res.push(`${prefix}CREATES -> ${id}`);
          const nested = printChild(n + 1, child);
          if (nested) {
            res.push(nested);
          }
        } else {
          res.push(`${prefix}uses -> ${id}`);
        }
      }
      return res.join("\n");
    }
    const lines = [
      `${this._type === 1 ? "CREATE" : "CALL"} ${this._name}`,
      `${printChild(1, this)}`,
      `DONE, took ${dur.toFixed(2)}ms (grand total ${Trace._totals.toFixed(2)}ms)`
    ];
    if (dur > 2 || causedCreation) {
      Trace.all.add(lines.join("\n"));
    }
  }
  constructor(type, name) {
    this._start = Date.now();
    this._dep = [];
    this._type = type;
    this._name = name;
  }
}
Trace.all = /* @__PURE__ */ new Set();
Trace._None = new class extends Trace {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  stop() {
  }
  branch() {
    return this;
  }
  constructor() {
    super(0, null);
  }
}();
Trace._totals = 0;


// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/event/emitter.js + 4 modules
var emitter = __webpack_require__(9017);
// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/_internal/logger.js
var logger = __webpack_require__(18144);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/di/instantiation-service.js










const _enableAllTracing = false;
class CyclicDependencyError extends Error {
  constructor(graph) {
    super("cyclic dependency between services");
    var _graph_findCycleSlow;
    this.message = (_graph_findCycleSlow = graph.findCycleSlow()) !== null && _graph_findCycleSlow !== void 0 ? _graph_findCycleSlow : `UNABLE to detect cycle, dumping graph: 
${graph.toString()}`;
  }
}
function emptyCallback() {
}
var InstantiationErrorType;
(function(InstantiationErrorType2) {
  InstantiationErrorType2["UnknownDependency"] = "UnknownDependency";
})(InstantiationErrorType || (InstantiationErrorType = {}));
class InstantiationService {
  get services() {
    return this._services;
  }
  // 仅限 Flow 调用
  get onError() {
    if (!this._emitter) {
      this._emitter = new emitter/* Emitter */.v();
    }
    return this._emitter.event;
  }
  // 创建子instantiationService
  createChild(services) {
    return new InstantiationService(services, this, this._afterServiceCreated, this._enableTracing);
  }
  // 提供通过instantiationService直接获取到内部服务的能力
  // 返回servicesAccessor这一视图类，并不暴露instantiationService内部接口
  invokeFunction(fn, ...args) {
    const _trace = Trace.traceInvocation(this._enableTracing, fn);
    let _done = false;
    try {
      const accessor = {
        get: (id) => {
          if (_done) {
            throw new Error("service accessor is only valid during the invocation of its target method");
          }
          const result = this._getOrCreateServiceInstance(id, _trace);
          if (!result) {
            this._handleError({
              errorType: "UnknownDependency",
              issuer: "service-accessor",
              dependencyId: `${id}`,
              message: `[invokeFunction] unknown service '${id}'`
            });
          }
          return result;
        }
      };
      return fn(accessor, ...args);
    } finally {
      _done = true;
      _trace.stop();
    }
  }
  createInstance(ctorOrDescriptor, ...rest) {
    let _trace, result;
    if (ctorOrDescriptor instanceof descriptor/* SyncDescriptor */.d) {
      _trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor.ctor);
      result = this._createInstance(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(rest), _trace);
    } else {
      _trace = Trace.traceCreation(this._enableTracing, ctorOrDescriptor);
      result = this._createInstance(ctorOrDescriptor, rest, _trace);
    }
    _trace.stop();
    return result;
  }
  // 创建实例
  _createInstance(ctor, args = [], _trace) {
    const serviceDependencies = (0,base/* getServiceDependencies */.B$)(ctor).sort((a, b) => a.index - b.index);
    const serviceArgs = [];
    for (const dependency of serviceDependencies) {
      const service = this._getOrCreateServiceInstance(dependency.id, _trace);
      if (!service) {
        this._handleError({
          errorType: "UnknownDependency",
          issuer: `create-instance-${ctor.name}`,
          dependencyId: `${dependency.id}`,
          message: `[createInstance] ${ctor.name} depends on UNKNOWN service ${dependency.id}.`
        });
      }
      serviceArgs.push(service);
    }
    const firstServiceArgPos = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;
    if (args.length !== firstServiceArgPos) {
      logger/* Logger */.V.trace(`[createInstance] First service dependency of ${ctor.name} at position ${firstServiceArgPos + 1} conflicts with ${args.length} static arguments`);
      const delta = firstServiceArgPos - args.length;
      if (delta > 0) {
        args = args.concat(new Array(delta));
      } else {
        args = args.slice(0, firstServiceArgPos);
      }
    }
    return Reflect.construct(ctor, args.concat(serviceArgs));
  }
  // 保存服务实例
  _setServiceInstance(id, instance) {
    if (this._services.get(id) instanceof descriptor/* SyncDescriptor */.d) {
      this._services.set(id, instance);
    } else if (this._parent) {
      this._parent._setServiceInstance(id, instance);
    } else {
      throw new Error("illegalState - setting UNKNOWN service instance");
    }
  }
  // 获取服务实例或者描述符
  _getServiceInstanceOrDescriptor(id) {
    const instanceOrDesc = this._services.get(id);
    if (!instanceOrDesc && this._parent) {
      return this._parent._getServiceInstanceOrDescriptor(id);
    } else {
      return instanceOrDesc;
    }
  }
  // 获取服务实例，没有的话就创建
  _getOrCreateServiceInstance(id, _trace) {
    if (this._globalGraph && this._globalGraphImplicitDependency) {
      this._globalGraph.insertEdge(this._globalGraphImplicitDependency, String(id));
    }
    const thing = this._getServiceInstanceOrDescriptor(id);
    if (thing instanceof descriptor/* SyncDescriptor */.d) {
      return this._safeCreateAndCacheServiceInstance(id, thing, _trace.branch(id, true));
    } else {
      _trace.branch(id, false);
      return thing;
    }
  }
  // 安全的创建并且记录在缓存中
  _safeCreateAndCacheServiceInstance(id, desc, _trace) {
    if (this._activeInstantiations.has(id)) {
      throw new Error(`illegal state - RECURSIVELY instantiating service '${id}'`);
    }
    this._activeInstantiations.add(id);
    try {
      return this._createAndCacheServiceInstance(id, desc, _trace);
    } finally {
      this._activeInstantiations.delete(id);
    }
  }
  // 非安全创建并记录在缓存中
  // 核心方法，服务创建的最基础流程
  _createAndCacheServiceInstance(id, desc, _trace) {
    const graph = new Graph((data) => data.id.toString());
    let cycleCount = 0;
    const stack = [
      {
        id,
        desc,
        _trace
      }
    ];
    while (stack.length) {
      const item = stack.pop();
      graph.lookupOrInsertNode(item);
      if (cycleCount++ > 1e3) {
        throw new CyclicDependencyError(graph);
      }
      for (const dependency of (0,base/* getServiceDependencies */.B$)(item.desc.ctor)) {
        var _this__globalGraph;
        const instanceOrDesc = this._getServiceInstanceOrDescriptor(dependency.id);
        if (!instanceOrDesc) {
          this._handleError({
            errorType: "UnknownDependency",
            issuer: `create-service-${id}`,
            dependencyId: `${dependency.id}`,
            message: `[createInstance] ${id} depends on ${dependency.id} which is NOT registered.`
          });
        }
        (_this__globalGraph = this._globalGraph) === null || _this__globalGraph === void 0 ? void 0 : _this__globalGraph.insertEdge(String(item.id), String(dependency.id));
        if (instanceOrDesc instanceof descriptor/* SyncDescriptor */.d) {
          const d = {
            id: dependency.id,
            desc: instanceOrDesc,
            _trace: item._trace.branch(dependency.id, true)
          };
          graph.insertEdge(item, d);
          stack.push(d);
        }
      }
    }
    while (true) {
      const leafs = graph.leafs();
      if (leafs.length === 0) {
        if (!graph.isEmpty()) {
          throw new CyclicDependencyError(graph);
        }
        break;
      }
      for (const { data } of leafs) {
        const instanceOrDesc = this._getServiceInstanceOrDescriptor(data.id);
        if (instanceOrDesc instanceof descriptor/* SyncDescriptor */.d) {
          const instance = this._createServiceInstanceWithOwner(data.id, data.desc.ctor, data.desc.staticArguments, data.desc.supportsDelayedInstantiation, data._trace);
          this._setServiceInstance(data.id, instance);
        }
        graph.removeNode(data);
      }
    }
    return this._getServiceInstanceOrDescriptor(id);
  }
  // 创建服务实例（会判断在哪层instantiation中判断）
  _createServiceInstanceWithOwner(id, ctor, args = [], supportsDelayedInstantiation, _trace) {
    if (this._services.get(id) instanceof descriptor/* SyncDescriptor */.d) {
      return this._createServiceInstance(id, ctor, args, supportsDelayedInstantiation, _trace);
    } else if (this._parent) {
      return this._parent._createServiceInstanceWithOwner(id, ctor, args, supportsDelayedInstantiation, _trace);
    } else {
      throw new Error(`illegalState - creating UNKNOWN service instance ${ctor.name}`);
    }
  }
  // 准备创建服务实例
  _createServiceInstance(id, ctor, args = [], supportsDelayedInstantiation, _trace) {
    if (!supportsDelayedInstantiation) {
      return this._createService(ctor, args, _trace);
    }
    const idle = new IdleValue(() => this._createService(ctor, args, _trace));
    return makeProxy(idle);
  }
  // 创建服务
  _createService(ctor, args = [], _trace) {
    const service = this._createInstance(ctor, args, _trace);
    this._afterServiceCreated(service);
    return service;
  }
  // 处理错误
  _handleError(errorData) {
    let topInstantiationService = this;
    while (topInstantiationService._parent) {
      topInstantiationService = topInstantiationService._parent;
    }
    if (topInstantiationService._emitter) {
      topInstantiationService._emitter.fire(errorData);
    }
    throw new Error(errorData.message);
  }
  constructor(services = new service_collection/* ServiceCollection */.a(), parent, afterServiceCreated = emptyCallback, enableTracing = _enableAllTracing) {
    this._activeInstantiations = /* @__PURE__ */ new Set();
    this._emitter = null;
    this._services = services;
    this._parent = parent;
    this._afterServiceCreated = afterServiceCreated;
    this._enableTracing = enableTracing;
    this._services.set(IInstantiationService, this);
    if (enableTracing) {
      var _parent__globalGraph;
      this._globalGraph = (_parent__globalGraph = parent === null || parent === void 0 ? void 0 : parent._globalGraph) !== null && _parent__globalGraph !== void 0 ? _parent__globalGraph : new Graph((e) => e);
    }
  }
}



/***/ }),

/***/ 73055:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

module.exports = __webpack_require__.p + "static/assets/worker.62dd3b59.js";

/***/ }),

/***/ 80436:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   B$: () => (/* binding */ getServiceDependencies),
/* harmony export */   u1: () => (/* binding */ createDecorator)
/* harmony export */ });
/* unused harmony exports DI_DEPENDENCIES, DI_TARGET, refineServiceDecorator */
const serviceIds = /* @__PURE__ */ new Map();
const DI_TARGET = "$di$target";
const DI_DEPENDENCIES = "$di$dependencies";
function getServiceDependencies(ctor) {
  return ctor[DI_DEPENDENCIES] || [];
}
function setServiceDependency(id, ctor, index) {
  if (ctor[DI_TARGET] === ctor) {
    ctor[DI_DEPENDENCIES].push({
      id,
      index
    });
  } else {
    ctor[DI_DEPENDENCIES] = [
      {
        id,
        index
      }
    ];
    ctor[DI_TARGET] = ctor;
  }
}
function createDecorator(serviceId) {
  if (serviceIds.has(serviceId)) {
    return serviceIds.get(serviceId);
  }
  const id = function(target, key, index) {
    if (arguments.length !== 3) {
      throw new Error("@IServiceName-decorator can only be used to decorate a parameter");
    }
    setServiceDependency(id, target, index);
  };
  id.toString = () => serviceId;
  serviceIds.set(serviceId, id);
  return id;
}
function refineServiceDecorator(serviceIdentifier) {
  return serviceIdentifier;
}



/***/ }),

/***/ 82262:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  jG: () => (/* binding */ Disposable),
  St: () => (/* binding */ SafeDisposable)
});

// UNUSED EXPORTS: MutableDisposable, RefCountedDisposable, TransferDisposable

// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/_internal/logger.js
var logger = __webpack_require__(18144);
// EXTERNAL MODULE: ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/assert/assert.js
var assert = __webpack_require__(85968);
;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/dispose/logger.js

let disposableLogger = null;
function setDisposableLogger(logger) {
  disposableLogger = logger;
}
function makeDefaultLogger() {
  return new class {
    branch(from, to) {
      this._dep.push([
        from,
        to
      ]);
    }
    end() {
      Logger.log(this._dep);
    }
    constructor() {
      this._dep = [];
    }
  }();
}
function BRANCH_DISPOSE(from, to) {
  disposableLogger === null || disposableLogger === void 0 ? void 0 : disposableLogger.branch(from, to);
}
function disposeWithLog(x, logger = makeDefaultLogger()) {
  setDisposableLogger(logger);
  x.dispose();
  logger.end();
  setDisposableLogger(null);
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/dispose/tracker.js


let disposableTracker = null;
function makeDefaultTracker() {
  const ignorePattern = /commitHookEffectList/i;
  const __is_disposable_tracked__ = "__is_disposable_tracked__";
  const __is_leak_marked__ = "__is_leak_marked__";
  return new class {
    trackDisposable(x) {
      const stack = new Error("Potentially leaked disposable").stack;
      setTimeout(() => {
        if (stack.match(ignorePattern)) {
          return;
        }
        if (x[__is_leak_marked__]) {
          return;
        }
        if (!x[__is_disposable_tracked__]) {
          Logger.log(stack);
        }
      }, 3e3);
    }
    setParent(child, parent) {
      if (child && child !== EmptyDispose) {
        try {
          child[__is_disposable_tracked__] = true;
        } catch (e) {
        }
      }
    }
    markAsDisposed(disposable) {
      if (disposable && disposable !== EmptyDispose) {
        try {
          disposable[__is_disposable_tracked__] = true;
        } catch (e) {
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    markAsLeaked(disposable) {
      if (disposable && disposable !== EmptyDispose) {
        try {
          disposable[__is_leak_marked__] = true;
        } catch (e) {
        }
      }
    }
  }();
}
function setDisposableTracker(tracker) {
  disposableTracker = tracker;
}
function enableTrack(tracker = makeDefaultTracker()) {
  setDisposableTracker(tracker);
}
function disableTrack() {
  setDisposableTracker(null);
}
function tracker_TRACK_DISPOSABLE(x) {
  disposableTracker === null || disposableTracker === void 0 ? void 0 : disposableTracker.trackDisposable(x);
  return x;
}
function tracker_MARK_AS_DISPOSED(x) {
  disposableTracker === null || disposableTracker === void 0 ? void 0 : disposableTracker.markAsDisposed(x);
}
function tracker_SET_PARENT_OF_DISPOSABLE(child, parent) {
  disposableTracker === null || disposableTracker === void 0 ? void 0 : disposableTracker.setParent(child, parent);
}
function MARK_AS_LEAKED(x) {
  disposableTracker === null || disposableTracker === void 0 ? void 0 : disposableTracker.markAsLeaked(x);
}


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/dispose/disposable-store.js



class DisposableStore {
  get isDisposed() {
    return this._isDisposed;
  }
  dispose() {
    if (this._isDisposed) {
      logger/* Logger */.V.warn(new Error("DisposableStore has disposed.").stack);
      return;
    }
    tracker_MARK_AS_DISPOSED(this);
    this._isDisposed = true;
    this.clear();
  }
  clear() {
    if (this._toDispose.size === 0) {
      return;
    }
    for (const disposable of this._toDispose) {
      BRANCH_DISPOSE(this.constructor.name, disposable.constructor.name);
    }
    const errors = [];
    for (const disposable of this._toDispose) {
      try {
        disposable.dispose();
      } catch (e) {
        errors.push(e);
      }
    }
    this._toDispose.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, "find error when dispose store.");
    }
  }
  add(o) {
    if (!o) {
      return o;
    }
    if (o === this) {
      throw new Error("Cannot register a disposable on itself.");
    }
    tracker_SET_PARENT_OF_DISPOSABLE(o, this);
    if (this._isDisposed) {
      if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
        logger/* Logger */.V.warn(new Error("Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!").stack);
      }
    } else {
      this._toDispose.add(o);
    }
    return o;
  }
  constructor() {
    this._toDispose = /* @__PURE__ */ new Set();
    this._isDisposed = false;
    tracker_TRACK_DISPOSABLE(this);
  }
}
DisposableStore.DISABLE_DISPOSED_WARNING = false;


;// ../../node_modules/.pnpm/@byted-image+lv-bedrock@1.4.0_@byted-lynx+react@0.103.5_@orbx+jsb@0.1.0-alpha.5/node_modules/@byted-image/lv-bedrock/es/dispose/disposable-t.js





class Disposable {
  // 销毁该节点和所有的子节点
  dispose() {
    tracker_MARK_AS_DISPOSED(this);
    BRANCH_DISPOSE(this.constructor.name, this._store.constructor.name);
    this._store.dispose();
  }
  // 挂载子节点
  _register(o) {
    if (o === this) {
      throw new Error("Cannot register a disposable on itself!");
    }
    return this._store.add(o);
  }
  constructor() {
    this._store = new DisposableStore();
    tracker_TRACK_DISPOSABLE(this);
    tracker_SET_PARENT_OF_DISPOSABLE(this._store, this);
  }
}
class MutableDisposable {
  get value() {
    return this._isDisposed ? void 0 : this._value;
  }
  set value(value) {
    var _this__value;
    if (this._isDisposed || value === this._value) {
      return;
    }
    (_this__value = this._value) === null || _this__value === void 0 ? void 0 : _this__value.dispose();
    if (value) {
      SET_PARENT_OF_DISPOSABLE(value, this);
    }
    this._value = value;
  }
  clear() {
    this.value = void 0;
  }
  dispose() {
    var _this__value;
    this._isDisposed = true;
    MARK_AS_DISPOSED(this);
    (_this__value = this._value) === null || _this__value === void 0 ? void 0 : _this__value.dispose();
    this._value = void 0;
  }
  release() {
    const oldValue = this._value;
    this._value = void 0;
    if (oldValue) {
      SET_PARENT_OF_DISPOSABLE(oldValue, null);
    }
    return oldValue;
  }
  constructor(value) {
    this._isDisposed = false;
    TRACK_DISPOSABLE(this);
    this.value = value;
  }
}
class SafeDisposable {
  get value() {
    return this._value;
  }
  isEmpty() {
    return this._value === void 0;
  }
  dispose() {
    if (!this._value) {
      return;
    }
    this._value.dispose();
    this._value = void 0;
    tracker_MARK_AS_DISPOSED(this);
  }
  constructor(value) {
    this._value = value;
    tracker_TRACK_DISPOSABLE(this);
  }
}
class RefCountedDisposable {
  get value() {
    return this._value;
  }
  acquire() {
    if (!this._value) {
      return this;
    }
    this._counter++;
    return this;
  }
  release() {
    if (--this._counter === 0) {
      this._value.dispose();
      this._value = void 0;
      MARK_AS_DISPOSED(this);
    }
    return this;
  }
  dispose() {
    this.release();
  }
  constructor(value) {
    this._counter = 1;
    this._value = value;
    TRACK_DISPOSABLE(this);
  }
}
class TransferDisposable extends Disposable {
  release() {
    (0,assert/* lvAssertNotNil */.F4)(this._val);
    const v = this._val;
    this._val = void 0;
    return v;
  }
  dispose() {
    var _this__val;
    logger/* Logger */.V.warn(new Error("TransferDisposable call dispose."));
    (_this__val = this._val) === null || _this__val === void 0 ? void 0 : _this__val.dispose();
    super.dispose();
  }
  constructor(val) {
    super();
    this._val = val;
  }
}



/***/ }),

/***/ 83078:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Z: () => (/* binding */ InstantiationContext),
/* harmony export */   h: () => (/* binding */ useService)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(11855);
/* harmony import */ var _assert__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(85968);


const Context = /* @__PURE__ */ (0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)(null);
const InstantiationContext = (props) => {
  return /* @__PURE__ */ (0,react__WEBPACK_IMPORTED_MODULE_0__.createElement)(Context.Provider, {
    value: props.instantiationService
  }, props.children);
};
function useService(identifier) {
  const instantiationService = (0,react__WEBPACK_IMPORTED_MODULE_0__.useContext)(Context);
  (0,_assert__WEBPACK_IMPORTED_MODULE_1__/* .lvAssertNotNil */ .F4)(instantiationService, "react components need service context.");
  const service = (0,react__WEBPACK_IMPORTED_MODULE_0__.useMemo)(() => instantiationService.invokeFunction((servicesAccessor) => servicesAccessor.get(identifier)), [
    instantiationService,
    identifier
  ]);
  return service;
}



/***/ }),

/***/ 85968:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   F4: () => (/* binding */ lvAssertNotNil),
/* harmony export */   X3: () => (/* binding */ lvAssert)
/* harmony export */ });
/* unused harmony exports lvAssertNever, lvAssertNotHere */
function abort(reason) {
  throw new Error(`lvAssert(${reason})`);
}
function lvAssert(expr, reason) {
  if (!expr) {
    abort(reason !== null && reason !== void 0 ? reason : "#expr is false");
  }
}
function lvAssertNotHere(reason) {
  abort(reason !== null && reason !== void 0 ? reason : "unreachable code flow");
}
function lvAssertNever(member, message = "Illegal value:") {
  abort(`${message}: ${member}`);
}
function lvAssertNotNil(val, reason) {
  if (val === null || val === void 0) {
    abort(reason !== null && reason !== void 0 ? reason : "#val is nil");
  }
}



/***/ })

}]);