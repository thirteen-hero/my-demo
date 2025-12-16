/**
 * 防抖函数原理：
 *  在某设定的时间内，没有再次触发某个函数，才真正调用这个函数
 * 核心思路：
 *  当触发一个函数时，不会立即执行这个函数，而是通过定时器来延迟执行
 *  如果在延迟时间内，又重新触发这个函数，则取消上一次的定时器，重新计算延迟时间
 *  如果在延迟时间内，没有重新触发这个函数，那么这个函数就正常执行
 * 使用场景：
 *  输入框回调
 *  频繁的点击事件
 *  监听浏览器滚动事件，完成某些特定操作
 *  用户缩放浏览器的resize事件
 * 
 * @param {*} callback 需要防抖处理的函数
 * @param {*} delay 延迟的时间
 * @param {*} immediate 是否立即执行
 * @param {*} resultCallBack 对防抖函数返回结果的回调
 * @returns 
 */
const debounce = (callback: Function, delay: number, immediate: boolean, resultCallback?: Function) => {
  let timer: any = null;
  let isInvoke = true; // 是否首次触发
  const _debounce = (...args: any[]) => {
    if (timer) {
      clearTimeout(timer);
    }
    if (isInvoke && immediate) {
      const result = callback(...args);
      if (resultCallback) resultCallback(result);
      isInvoke = false;
    } else {
      timer = setTimeout(() => {
        const result = callback(...args);
        if (resultCallback) resultCallback(result);
        isInvoke = false;
      }, delay);
    }
  }
  // @ts-ignore
  debounce.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    isInvoke = true;
  }
  return _debounce;
}

export default debounce;