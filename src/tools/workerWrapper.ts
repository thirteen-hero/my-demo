export enum STATUS {
  WAITING = 'waiting',
  RUNNING = 'running',
}

interface WorkerParams {
  data: any;
  index: number;
}

// web worker交互容器
// 接收具体业务组件获取数据的请求方法和接收数据的回调
class WorkerWrapper {
  // 创建的web worker线程
  worker: Worker;
  // 当前线程的状态 等待｜运行中
  status: STATUS;

  constructor(
    worker: Worker, 
  ) {
    this.worker = worker;
    this.status = STATUS.WAITING;
  }

  // 运行当前web worker
  run = (params: WorkerParams) => {
    this.status = STATUS.RUNNING;
    return new Promise((resolve, reject) => {
      this.worker.onmessage = e => {
        const { chunkHash, error } = e.data;
        this.status = STATUS.WAITING;
        if (error) {
          reject(error);
        } else {
          resolve(chunkHash);
        }
      }
      const { data, index } = params;
      this.worker.postMessage({
        chunkArrayBuffer: data,
        index,
      })
    })
  }

  // 关闭当前线程
  terminate = () => {
    this.worker.terminate();
  }
}

export default WorkerWrapper;