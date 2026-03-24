// @ts-ignore
const asyncLoadImage = (url: string): Promise[string] => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
      console.log('图片加载成功');
    }
    img.onerror = (error) => {
      reject(error);
    }
    img.src = url;
  })
}

/**
 * 高可靠并发控制器
 * @param {Array} requestList - 任务列表
 * @param {number} limit - 最大并发数
 * @param {Function} request - 请求函数
 * @param {number} retry - 最大重试次数
 * @param {number} delay - 基础延迟时间(ms)
 */
const concurrentLimit = async(
  requestList: any[], 
  limit: number = 5, 
  request: any,
  retry: number = 3,
  delay: number = 1000,
  timeout: number = 10000,
) => {
    const promises = new Set();
    for (const item of requestList) {
      // 如果坑位满了,等待任意一个任务完成,腾出坑位
      if (promises.size >= limit) {
        await Promise.race(promises);
      }
      // 创建带重试的任务
      const promise = retryPromise((signal) => Promise.resolve(request({signal, ...item})), retry, retry, delay, timeout)
        .then((res) => {
          // 释放坑位
          promises.delete(promise);
          return {
            status: 'fulfilled',
            value: res,
          };
        })
        .catch((error) => {
          // 释放坑位
          promises.delete(promise);
          return { 
            status: 'rejected', 
            reason: error 
          };
        })
      promises.add(promise);
    }
    // 等待所有任务完成(这里永远不会因任何一个任务失败而中断,因为错误都被上面捕获并包装了)
    return Promise.all(promises);
}

/**
 * 带指数退避和随机抖动(Jitter)的重试函数
 * @param {Function} taskFn - 任务工厂函数
 * @param {number} maxRetry - 最大重试次数
 * @param {number} restRetry - 剩余重试次数
 * @param {number} delay - 基础延迟时间
 */
const retryPromise = (
  // 传入的是一个闭包函数,确保每次重试都是发起新的请求
  taskFn: (signal: AbortSignal) => Promise<any>, 
  maxRetry: number = 3,
  restRetry: number = 3, 
  // 当前延迟时间,用于指数退避
  delay: number = 1000,
  timeout: number = 10000,
) => {
  const controller = new AbortController();
  const { signal } = controller;
  return new Promise((resolve, reject) => {
    // 请求超时即取消请求
    const timerId = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }, timeout);
    taskFn(signal)
      .then((res) => {
        clearTimeout(timerId);
        resolve(res);
      })
      .catch((error: Error) => {
        clearTimeout(timerId);
        if (signal.aborted) {
          reject(`请求超时,超时时时间为:${timeout / 1000}s`);
          return; // 关键：超时直接拒绝，不再进入重试逻辑
        }
        // 次数耗尽,彻底失败
        if (restRetry === 0) {
          reject(error);
        } else {
          // 等待一段时间后递归重试
          // 使用delay*2实现指数退避（1s, 2s, 4s...)
          // 采用延迟重试的原因:多个并发请求在同一时间因网络问题失败,若不延迟重试,那么会在同一时间爆发大量请求,导致网络拥塞，即使限制了重试次数
          // 采用指数退避原因: 给了服务器和网络恢复的时间,避免“由于网络拥堵导致的连续失败”
          // 增加随机数原因: 如果大量请求在同一毫秒发起,它们的重试节奏会完全同步,导致服务器在特定时间点（如第2秒）再次受到集中冲击

          // 假设初始 delay=1000
          // 第1次重试 (count=3): 1000 * 2^0 = 1000ms
          // 第2次重试 (count=2): 1000 * 2^1 = 2000ms
          // 第3次重试 (count=1): 1000 * 2^2 = 4000ms
          // 加上随机抖动 (0.5 ~ 1.5), 避免多请求同步震荡
          const failed = maxRetry - restRetry;
          const exponentialDelay = delay * Math.pow(2, failed);
          const jitter = 0.5 + Math.random(); 
          const nextDelay = exponentialDelay * jitter;
          setTimeout(() => {
            retryPromise(taskFn, maxRetry, restRetry - 1, delay, timeout)
            .then(resolve)
            .catch(reject);
          }, nextDelay);
        }
      });
  });
}

export {
  asyncLoadImage,
  concurrentLimit,
}