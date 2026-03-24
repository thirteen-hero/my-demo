import PubSub, { EVENT_TYPE } from "./pubSub";
import WorkerWrapper, { STATUS } from "./workerWrapper";
interface WorkerPoolRes {
  index: number;
  res: any;
}

class WorkerPool {
  pool: WorkerWrapper[] = [];
  maxWorkers: number; 
  // 初始化一个发布订阅对象 初始化值
  currRunningWorker = new PubSub(0);
  // 存储每组的结果
  result: any[][] = [];

  constructor(maxWorkers: number) {
    this.maxWorkers = maxWorkers;
  }

  exec = (chunks: ArrayBuffer[]) => {
    // 接收每组分片的数据
    const workerParams = chunks.map((chunk, index) => ({
      data: chunk,
      index,
    }))
    // 每组分片返回一个promise promise的结果是每组分片的计算结果数组
    return new Promise(resolve => {
      const calculateHash = (count: number) => {
        // 当前有可执行线程数量且有待执行任务
        if (count < this.maxWorkers && !!workerParams.length) {
          // 当前能跑的任务数量
          let currTaskCount = this.maxWorkers - count;
          if (currTaskCount > workerParams.length) {
            currTaskCount = workerParams.length;
          }

          // 此时可以用来执行任务的worker
          const canUseWorker: WorkerWrapper[] = [];
          for (const worker of this.pool) {
            if (worker.status === STATUS.WAITING) {
              canUseWorker.push(worker);
              if (canUseWorker.length === currTaskCount) break;
            }
          }

          const paramsToRun = workerParams.splice(0, currTaskCount);

          // 更新当前跑起来的worker的数量
          this.currRunningWorker.publish(
            EVENT_TYPE.RUN, 
            this.currRunningWorker.value + currTaskCount,
            false,
          );
          // 循环执行并发任务并收集结果
          const result: WorkerPoolRes[] = [];
          canUseWorker.forEach((worker, innerIndex) => {
            const param = paramsToRun[innerIndex];
            worker
            .run(param)
            // @ts-ignore
            .then(res => {
              result.push({ 
                res, 
                index: innerIndex 
              })
            })
            .catch(error => {
              result.push({ 
                res: error, 
                index: innerIndex 
              })
              console.log(error);
            })
            .finally(() => {
              this.currRunningWorker.publish(
                EVENT_TYPE.RUN,
                this.currRunningWorker.value - 1,
                false,
              );
              // 当前任务是最后一个可执行任务 返回promise的结果
              if (this.currRunningWorker.value === 0 && workerParams.length === 0) {
                this.result.push(...result.sort((a: WorkerPoolRes, b: WorkerPoolRes) => a.index - b.index).map((item: WorkerPoolRes) => item.res));
                resolve(this.result);
                // 取消订阅函数
                this.currRunningWorker.unSubscribe(
                  EVENT_TYPE.RUN,
                  calculateHash,
                );
              }
            })
          })
        }
      }
      // 发起订阅函数
      this.currRunningWorker.subscribe(
        EVENT_TYPE.RUN, 
        calculateHash
      );

      // 触发每组任务开始执行
      this.currRunningWorker.publish(
        EVENT_TYPE.RUN, // 当前触发的订阅函数
        this.currRunningWorker.value, // 需要更改的值
        true,
      )
    })
  }

  // 循环关闭web worker
  terminate = () => {
    this.pool.forEach(item => item.terminate());
  }
}

export default WorkerPool;