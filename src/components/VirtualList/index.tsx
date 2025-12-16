import React, { Component, createRef } from 'react';
import throttle from 'src/tools/throttle';

import styles from './index.module.less';

interface ItemProps {
  content: number;
}
interface IProps {
  // 需要渲染的数据
  data: any[]; 
  // 列表项的高度
  itemHeight: number; 
  // 需要渲染的列表项组件
  Item: ({ content }: ItemProps) => JSX.Element; 
}
interface IState {
  start: number; // 开始渲染的索引
  eachNum: number; // 每次渲染的条数
}

let eachNum = 0;
class VirtualList extends Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      start: 0,
      eachNum: 0,
    }
    // 给滚动事件回调函数增加防抖 同时扩大缓冲区
    this.handleScroll = throttle(this.handleScroll, 100, true, true);
  }

  contextRef = createRef<HTMLDivElement>();
  boxRef = createRef<HTMLDivElement>();

  handleScroll = () => {
    if (!this.boxRef.current || !this.contextRef.current) return;
    const { itemHeight } = this.props;
    // 容器滚动高度
    const scrollTop = this.boxRef.current.scrollTop;
    // 下次开始展示的数据索引
    // 上方预留了五条缓冲数据
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 5);
    // 当前的偏离距离
    // 前五条数据卷上去不做偏离 第四条数据卷上去才开始做偏离 和五条缓冲数据相结合形成了缓冲区
    const currOffset = start * itemHeight;
    // 此处使用transform: translate做平移是保证展示的内容展示区域在滚动过程中不断平移,以保证向上或向下都有滚动的空间
    // 强制启用GPU(硬件)加速
    this.contextRef.current.style.transform = `translate3d(0, ${currOffset}px, 0)`;
    this.setState({ start });
  }

  componentDidMount() {
    if (!this.boxRef.current) return;
    const { itemHeight } = this.props;
    const height = this.boxRef.current.offsetHeight;
    // 每次渲染的项数 = 容器高度 / (每项高度 + 每项margin)
    eachNum = Math.ceil(height / itemHeight);
    this.setState({ eachNum });
  }

  render () {
    const { start } = this.state;
    const { data, Item } = this.props;
    // 前五条数据往上卷但是未做偏离,因此尾部大于3才能保证页面可继续向下滚动,+6表示尾部存在五条数据的缓冲区
    const renderList = data.slice(start, start + eachNum + 10);
    return (
      <div 
        ref={this.boxRef} 
        className={styles.box} 
        onScroll={this.handleScroll}
      >
        <div ref={this.contextRef}>
          {renderList.map(item => (
            <Item content={item} key={item} />
          ))}
        </div>
      </div>
    )
  }
}

export default VirtualList;
