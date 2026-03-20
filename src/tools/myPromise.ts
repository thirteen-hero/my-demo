enum STATE {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  REJECTED = 'rejected',
}
const isFunction = (val: any) => {
  return typeof val === 'function';
}
const isObject = (val: any) => {
  return typeof val === 'object' && val !== null;
}
const isThenable = (val: any) => {
  return (isFunction(val) || isObject(val)) && isFunction(val?.then);
}
const resolvePromise = (
  returnPromise: MyPromise,
  result: any,
  resolve: (value: any) => void,
  reject: (reason: any) => void,
) => {
  if (isThenable(result)) {
    if (returnPromise === result) {
      reject(new TypeError('Chaining cycle detected for promise <#MyPromise>'));
      return;
    }
    queueMicrotask(() => {
      result
      .then(
        (value: any) => 
          resolvePromise(
            returnPromise, 
            value, 
            resolve, 
            reject,
          )
        ,
        (reason: any) => reject(reason)
      )
    });
    return;
  } 
  resolve(result);
}
class MyPromise {
  state = STATE.PENDING;
  value = undefined;
  reason = undefined;
  onFulfilledCallbacks: Function[] = [];
  onRejectedCallbacks: Function[] = [];

  constructor(executor: (
    resolve: (value: any) => void, 
    reject: (reason: any) => void,
  ) => void) {
    const resolve = (value: any) => {
      if (this.state !== STATE.PENDING) return;
      if (isThenable(value)) {
        if (value === this) {
          reject(new TypeError('Chaining cycle detected for promise <#MyPromise>'));
          return;
        }
        queueMicrotask(() => {
          value.then(
            (value: any) => resolve(value),
            (reason: any) => reject(reason),
          );
        })
        return;
      }
      this.state = STATE.FULFILLED;
      this.value = value;
      this.onFulfilledCallbacks.forEach(cb => cb?.(value));
    }
    const reject = (reason: any) => {
      if (this.state !== STATE.PENDING) return;
      this.state = STATE.REJECTED;
      this.reason = reason;
      this.onRejectedCallbacks.forEach(cb => cb?.(reason));
    }
    try {
      executor(resolve, reject)
    } catch(error) {
      reject(error);
    }
  }

  then = (onFulfilled?: any, onRejected?: any) => {
    onFulfilled = isFunction(onFulfilled) ? onFulfilled : (value: any) => value;
    onRejected = isFunction(onRejected) ? 
      onRejected : 
      (reason: any) => {
        throw new Error(reason)
      }
    const returnPromise = new MyPromise((resolve, reject) => {
      const onFulfilledHandle = (value: any) => {
        queueMicrotask(() => {
          try {
            const result = onFulfilled(value);
            resolvePromise(returnPromise, result, resolve, reject);
          } catch (error: any) {
            reject(error);
          }
        });
      }
      const onRejectedHandle = (reason: any) => {
        queueMicrotask(() => {
          try {
            const result = onRejected(reason);
            resolvePromise(returnPromise, result, resolve, reject);
          } catch (error: any) {
            reject(error);
          }
        });
      }
      if (this.state === STATE.FULFILLED) {
        onFulfilledHandle(this.value);
      } else if (this.state === STATE.REJECTED) {
        onRejectedHandle(this.reason);
      } else {
        this.onFulfilledCallbacks.push(onFulfilledHandle);
        this.onRejectedCallbacks.push(onRejectedHandle);
      }
    });
    return returnPromise;
  }

  catch = (onRejected: Function) => {
    return this.then(undefined, onRejected);
  }

  finally = (onFinally: Function) => {
    if (!isFunction(onFinally)) return this.then(onFinally, onFinally);
    return this.then(
        (value: any) => {
          return MyPromise.resolve(onFinally())
            .then(
              () => value,
              (reason: any) => {
                throw reason;
              }
            )
        },
        (reason: any) => {
          return MyPromise.resolve(onFinally())
            .then(
              () => {
                throw reason;
              },
              (newReason: any) => {
                throw newReason;
              }
            )
        }
        )
  }

  static resolve = (value: any) => {
    if (value instanceof MyPromise) return value;
    return new MyPromise((resolve) => resolve(value));
  }

  static reject = (reason: any) => {
    return new MyPromise((_, reject) => reject(reason));
  }

  static all = (promises: any) => {
    return new MyPromise((resolve, reject) => {
      if (!isFunction(promises[Symbol.iterator])) {
        reject(new TypeError(`${typeof promises} is not iterable`));
        return;
      }
      if (promises.length === 0) {
        resolve([]);
        return;
      }
      const result: any = [];
      let resolvedCount = 0;
      promises.forEach((p: any, index: number) => {
        MyPromise.resolve(p)
          .then((value: any) => {
            result[index] = value;
            resolvedCount++;
            if (resolvedCount === promises.length) resolve(result);
          })
          .catch((error: any) => reject(error));
      })
    })
  }

  static race = (promises: any) => {
    return new MyPromise((resolve, reject) => {
      if (!isFunction(promises[Symbol.iterator])) {
        reject(new TypeError(`${typeof promises} is not iterable`));
        return;
      }
      if (promises.length === 0) return;
      promises.forEach((p: any) => {
        MyPromise.resolve(p)
          .then((value: any) => resolve(value))
          .catch((error: any) => reject(error));
      })
    })
  }

  static allSettled = (promises: any) => {
    return new MyPromise((resolve, reject) => {
      if (!isFunction(promises[Symbol.iterator])) {
        reject(new TypeError(`${typeof promises} is not iterable`));
        return;
      }
      if (promises.length === 0) {
        resolve([]);
        return;
      }
      const result: any = [];
      let completedCount = 0;
      promises.forEach((p: any, index: number) => {
        MyPromise.resolve(p)
          .then((value: any) => {
            result[index] = {
              status: STATE.FULFILLED,
              value,
            }
            completedCount++;
            if (completedCount === promises.length) resolve(result);
          })
          .catch((error: any) => {
            result[index] = {
              status: STATE.REJECTED,
              reason: error,
            }
            completedCount++;
            if (completedCount === promises.length) resolve(result);
          })
      })
    })
  }

  static any = (promises: any) => {
    return new MyPromise((resolve, reject) => {
      if (!isFunction(promises[Symbol.iterator])) {
        reject(new TypeError(`${typeof promises} is not iterable`));
        return;
      }
      if (promises.length === 0) {
        reject(new AggregateError([], 'All promises were rejected'));
        return;
      }
      const result: any = [];
      let rejectedCount = 0;
      promises.forEach((p: any, index: number) => {
        MyPromise.resolve(p)
          .then((value: any) => resolve(value))
          .catch((error: any) => {
            result[index] = error;
            rejectedCount++;
            if (rejectedCount === promises.length) {
              reject(new AggregateError(result, 'All promises were rejected'));
            }
          })
      })
    })
  }
}

export default MyPromise;