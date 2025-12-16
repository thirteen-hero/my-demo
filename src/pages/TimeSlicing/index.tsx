import React, { useMemo, useState, useRef, useEffect } from 'react';

import styles from './index.module.less';
// 时间分片
const TimeSlicing = () => {
  const boxRef = useRef(null);
  const eachRenderNum = 500;
  const originList = new Array(20000).fill(null);

  const [renderList, setRenderList] = useState([]);

  useEffect(() => {
    toRender(1, renderList);
  }, []);

  const toRender = (index: number, list: any[]) => {
    const times = originList.length / eachRenderNum;
    if (index > times || !boxRef.current) return;
    const { offsetWidth, offsetHeight } = boxRef.current;
    // 不要原地操作 useState中setState时会对两个值进行浅比较（比较内存地址） 若发现两个值相同（即指向同一个内存地址）则不会触发视图更新
    const newList = list.slice();
    // 通过缓存element把所有渲染完成的list缓存下来，下一次更新，直接跳过渲染
    newList.push(renderNewList(index, offsetWidth, offsetHeight));
    // @ts-ignore
    setRenderList(newList);
    // 用 requestIdleCallback 代替 setTimeout 浏览器空闲执行下一批渲染
    requestIdleCallback(() => {
      toRender(++index, newList);
    })
  }

  const renderNewList = (index: number, width: number, height: number) => {
    const list = originList.slice((index-1) * eachRenderNum, index * eachRenderNum);

    return (
      <div key={index}>
        {list.map((_, idx) => (
          <Circle key={idx} position={{width, height}} />
        ))}
      </div>
    )
  }

  return (
    <div ref={boxRef} className={styles.box} >
      {renderList}
    </div>
  )
}

export default TimeSlicing;

interface ICircleProps {
  position: {
    width: number;
    height: number;
  }
}

const Circle = ({ position }: ICircleProps) => {
  const getColor = () => {
    const r = Math.floor(Math.random()*255);
    const g = Math.floor(Math.random()*255);
    const b = Math.floor(Math.random()*255);
    return `rgba(${r},${g},${b},0.8)`;
  }

  const getPosition = () => {
    const { width, height } = position;
    const left = `${Math.ceil(Math.random() * width)}px`;
    const top = `${Math.ceil(Math.random() * height)}px`;
    return {
      left,
      top,
    }
  }

  const style = useMemo(() => {
    return {
      background: getColor(),
      ...getPosition(),
    }
  }, [])

  return (
      <div 
        className={styles.circle}
        style={style} 
      />
  )
}

// requestIdleCallback
// requestIdleCallback 的回调利用的是帧的空闲时间，属于低优先级任务。
// 由于requestIdleCallback利用的是帧的空闲时间，所以有可能出现浏览器一直处于繁忙状态而无法执行回调的情况，这种情况可以通过传入第二个参数timeout解决。
// timeout：若指定了timeout并且是一个正值，若回调在timeout毫秒过后没有被调用，那么将回调放入事件循环中排队。
// requestIdleCallback(myNonEssentialWork, { timeout: 2000 });
// 若需要通过timeout去执行回调的话，用户就可能感知到卡顿了，因为一帧的执行时间必然超过16ms了。
// requestIdleCallback回调内建议做的事情：1、数据的分析和上报 2、预加载 3、检测卡顿 4、拆分耗时任务（时间分片）
// requestIdleCallback回调内不建议做的事情：
// 1、修改dom的操作
// 从上面一帧的构成中可以看出，requestIdleCallback 回调执行之前, 样式变更以及布局计算等都已经完成。如果在callback中修改DOM的话, 之前所作的布局计算都会失效。 并且如果下一帧里有获取布局相关的操作, 浏览器就需要强制进行重排, 极大的影响性能。 另外由于修改 DOM 的时间是不可预测的, 因此容易超过当前帧空闲的阈值.
// 2、promise的resolve(reject)回调
// Promise的回调会在idle的回调执行完成后立即执行, 拉长当前帧的耗时。 promise的回调属于优先级较高的微任务，所以会在 requestIdleCallback 回调结束后立即执行，可能会给这一帧带来超时的风险。

// requestAnimationFrame
// requestAnimationFrame 的回调会在每一帧确定执行，属于高优先级任务。

// requestIdleCallback 和 requestAnimationFrame 区别
// 我们看到的页面是浏览器一帧一帧绘制出来的, 通常 FPS 在 60 的时候是比较流畅的, 而 FPS 比较低的时候就会感觉到卡顿。
// 每一帧的浏览器会做的事情：用户交互，js脚本执行，requestAnimationFrame 调用，布局计算及页面重绘等。
// 若一帧里执行的任务不多，在16.66ms(1000/60)内完成了上述任务，那么这一帧就有空闲时间来执行 requestIdleCallback 回调。
// 当程序栈为空页面无需更新的时候, 浏览器处于空闲状态, 此时留给 requestIdleCallback 执行的时间可以适当拉长, 最长达到50ms, 以防出现不可预测的任务(如用户输入), 避免无法及时响应使用户感知到延迟。

// 推荐在requestAnimationFrame里面做dom的修改，可以在requestIdleCallback里面构建Document Fragment，然后在下一帧的requestAnimationFrame里面应用Fragment。