/**
 * 节流函数原理：
 *  在某个时间内，函数只能被触发一次
 * 核心思路：
 *  使用lastTime来记录函数上一次执行的时间
 *  每次准备执行前，计算nowTime-lastTime>interval，函数立即执行，并把nowTime赋值给lastTime
 * 使用场景：
 *  监听页面滚动事件
 *  鼠标移动事件
 *  用户频繁点击按钮的操作
 * 
 * @param {*} callback 需要节流处理的函数
 * @param {*} interval 函数执行间隔的时间
 * @param {*} leading 第一次是否执行
 * @param {*} trailing 最后一次是否执行
 * @param {*} resultCallback 执行结果的回调
 */

const throttle = (
  callback: Function, 
  interval: number, 
  leading: boolean, 
  trailing: boolean, 
  resultCallback?: Function
) => {
  let timer: any = null; // 记录上一次开始的时间
  let lastTime = 0; // 存储最后一次执行的定时器
  const _throttle = (...args: any[]) => {
    // 记录当前事件触发的时间
    let nowTime = new Date().getTime();
    // 第一次调用函数并且设置第一次不执行
    if (!leading && !lastTime) lastTime = nowTime;
    // 计算执行函数需要的间隔时间
    const remainTime = interval - (nowTime - lastTime);
    // 达到规定的间隔时间
    if (remainTime <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const result = callback(...args);
      if (resultCallback) resultCallback(result);
      lastTime = nowTime;
      return;
    }
    // 设置了最后一次执行 多久后触发由remainTime决定
    if(trailing && !timer) {
      timer = setTimeout(() => {
        const result = callback(...args);
        if (resultCallback) resultCallback(result);
        timer = null;
        lastTime = !leading ? 0 : new Date().getTime(); // 第一次不执行时为0 第一次执行时为定时器触发的时间
      }, remainTime);
    }
  }

  return _throttle;
}

export default throttle;