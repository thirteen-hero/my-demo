export enum STATUS {
  WAITING = 'waiting',
  RUNNING = 'running',
}

interface WorkerParams {
  data: any;
  index: number;
}

type Resolve<T = any> = (value: T | PromiseLike<T>) => void;
type Reject = (reason?: any) => void;

// web worker交互容器
// 接收具体业务组件获取数据的请求方法和接收数据的回调
class WorkerWrapper {
  // 创建的web worker线程
  worker: Worker;
  // 当前线程的状态 等待｜运行中
  status: STATUS;
  // 获取数据的回调
  getData: (
    worker: Worker, 
    resolve: Resolve, 
    reject: Reject
  ) => void;
  // 接收数据的回调
  postData: (worker: Worker, params: WorkerParams) => void;

  constructor(
    worker: Worker, 
    getData: (
      worker: Worker, 
      resolve: Resolve, 
      reject: Reject,
    ) => void,
    postData: (
      worker: Worker, 
      params: WorkerParams) => void,
  ) {
    this.worker = worker;
    this.status = STATUS.WAITING;
    this.getData = getData.bind(null);
    this.postData = postData.bind(null);
  }

  // 运行当前web worker
  run = (params: WorkerParams) => {
    this.status = STATUS.RUNNING;

    const onMessage = (resolve: Resolve, reject: Reject) => {
      this.getData(this.worker, resolve, reject);
      this.status = STATUS.WAITING;
    }

    return new Promise((resolve, reject) => {
      onMessage(resolve, reject);
      this.postData(this.worker, params);
    })
  }

  // 关闭当前线程
  terminate = () => {
    this.worker.terminate();
  }
}

export default WorkerWrapper;