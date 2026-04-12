enum STATE {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  REJECTED = 'rejected',
}

const isFunction = (val: any): val is Function => typeof val === 'function';
const isObject = (val: any) => typeof val === 'object' && val !== null;

const asyncRun = (task: () => void) => {
  queueMicrotask(task);
};

class MyPromise {
  state = STATE.PENDING;
  value = undefined;
  reason = undefined;
  onFulfilledCallbacks: Array<() => void> = [];
  onRejectedCallbacks: Array<() => void> = [];

  constructor(
    executor: (
      resolve: (value: any) => void,
      reject: (reason: any) => void,
    ) => void,
  ) {
    const resolve = (value: any) => {
      // Promise/A+ 只允许从 pending 迁移一次
      if (this.state !== STATE.PENDING) return;
      // 统一走 Promise Resolution Procedure，保证 thenable 吸收逻辑符合 A+
      resolvePromise(
        this,
        value,
        (resolvedValue: any) => {
          if (this.state !== STATE.PENDING) return;
          this.state = STATE.FULFILLED;
          this.value = resolvedValue;
          this.onFulfilledCallbacks.forEach((cb) => cb());
        },
        (reason: any) => {
          reject(reason);
        },
      );
    };

    const reject = (reason: any) => {
      if (this.state !== STATE.PENDING) return;
      this.state = STATE.REJECTED;
      this.reason = reason;
      this.onRejectedCallbacks.forEach((cb) => cb());
    };

    try {
      executor(resolve, reject);
    } catch (error) {
      reject(error);
    }
  }

  then = (onFulfilled?: any, onRejected?: any) => {
    // A+ 2.2.1 / 2.2.7.3：非函数成功回调要被忽略，表现为值穿透
    const realOnFulfilled = isFunction(onFulfilled)
      ? onFulfilled
      : (value: any) => value;

    // A+ 2.2.2 / 2.2.7.4：非函数失败回调要被忽略，表现为 reason 原样继续抛出
    const realOnRejected = isFunction(onRejected)
      ? onRejected
      : (reason: any) => {
          throw reason;
        };

    const returnPromise = new MyPromise((resolve, reject) => {
      const onFulfilledTask = () => {
        // A+ 2.2.4：onFulfilled 必须在执行栈清空后异步执行
        asyncRun(() => {
          try {
            const x = realOnFulfilled(this.value);
            // A+ 2.3：then 返回的新 promise 必须按 Resolution Procedure 解析 x
            resolvePromise(returnPromise, x, resolve, reject);
          } catch (error) {
            reject(error);
          }
        });
      };

      const onRejectedTask = () => {
        // A+ 2.2.4：onRejected 同样必须异步执行
        asyncRun(() => {
          try {
            const x = realOnRejected(this.reason);
            resolvePromise(returnPromise, x, resolve, reject);
          } catch (error) {
            reject(error);
          }
        });
      };

      if (this.state === STATE.FULFILLED) {
        onFulfilledTask();
        return;
      }

      if (this.state === STATE.REJECTED) {
        onRejectedTask();
        return;
      }

      this.onFulfilledCallbacks.push(onFulfilledTask);
      this.onRejectedCallbacks.push(onRejectedTask);
    });

    return returnPromise;
  };

  catch = (onRejected: Function) => {
    return this.then(undefined, onRejected);
  };

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
  };

  static reject = (reason: any) => {
    return new MyPromise((_, reject) => reject(reason));
  };

  static all = (promises:any) => {
    return new MyPromise((resolve, reject) => {
      if (!isFunction(promises[Symbol.iterator])) {
        reject(new TypeError(`${typeof promises} is not iterable`));
        return;
      }
      if (promises.length === 0) {
        resolve([]);
        return;
      }

      const result: any[] = [];
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
            if (rejectedCount === promises.
            length) {
              reject(new AggregateError(result, 
              'All promises were rejected'));
            }
          })
      })
    })
  }
}
/**
 * Promise/A+ 2.3 Promise Resolution Procedure
 *
 * 作用：解析 then 返回值 x，并决定 promise2 的最终状态。
 */
const resolvePromise = (
  promise2: MyPromise,
  x: any,
  resolve: (value: any) => void,
  reject: (reason: any) => void,
) => {
  // A+ 2.3.1：promise 和 then 返回值不能是同一个对象，否则形成循环引用
  if (promise2 === x) {
    reject(new TypeError('Chaining cycle detected for promise <#MyPromise>'));
    return;
  }

  // A+ 2.3.3：只有 object/function 才可能是 thenable
  if (x !== null && (isObject(x) || isFunction(x))) {
    let called = false;

    try {
      // A+ 2.3.3.1：先取出 then；若取值时抛错，需要 reject
      const then = x.then;
      // A+ 2.3.3.3：如果 then 是函数，把 x 当作 this 去调用
      if (isFunction(then)) {
        asyncRun(() => {
          try {
            then.call(
              x,
              (y: any) => {
                // A+ 2.3.3.3.3：resolve/reject 只能第一次生效
                if (called) return;
                called = true;
                resolvePromise(promise2, y, resolve, reject);
              },
              (r: any) => {
                if (called) return;
                called = true;
                reject(r);
              },
            )
          } catch (error) {
            if (called) return;
            called = true;
            reject(error);
          }
        });
        return;
      }
    } catch (error) {
      // A+ 2.3.3.2 / 2.3.3.3.4：取 then 或执行 then 抛错时，若尚未决议则 reject
      if (called) return;
      reject(error);
      return;
    }
  }

  // A+ 2.3.3.4：x 不是 thenable，直接 fulfill
  resolve(x);
};

export default MyPromise;
