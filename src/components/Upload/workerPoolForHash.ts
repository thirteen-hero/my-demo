import WorkerPool from 'src/tools/workerPool';
import WorkerWrapper from 'src/tools/workerWrapper';

interface WorkerParams {
  data: any;
  index: number;
}
type Resolve<T = any> = (value: T | PromiseLike<T>) => void;
type Reject<T = any> = (value: T | PromiseLike<T>) => void;

const hashWorkerStr = `
  import SparkMD5 from 'spark-md5';

  // 计算每个chunk的md5
  self.addEventListener('message', (e) => {
    try {
      const spark = new SparkMD5.ArrayBuffer();
      const { chunkArrayBuffer } = e.data;
      spark.append(chunkArrayBuffer);
      const chunkHash = spark.end();
      self.postMessage({ chunkHash });
    } catch(error) {
      self.postMessage({ error });
      self.close();
    }
  })
`;

// 针对大文件上传的workerPool类 继承了workerPool类
// 用于创建并发池和自定义web worker交互方法,并采用回调的方式进行交互
class workerPoolForHash extends WorkerPool {
  pool: WorkerWrapper[] = [];

  constructor(maxWorkers: number) {
    super(maxWorkers);
    // 获取web worker执行结果
    const getData = (
      worker: Worker, 
      resolve: Resolve, 
      reject: Reject,
    ) => {
      worker.onmessage = e => {
        const { chunkHash, error } = e.data;
        if (error) {
          reject(error);
        } else {
          resolve(chunkHash);
        }
      }
    }
    // 调用web worker线程并传参
    const postDate = (
      worker: Worker, 
      params: WorkerParams
    ) => {
      const { data, index } = params;
      worker.postMessage({ 
        chunkArrayBuffer: data, 
        index,
      });
    }
    // 根据最大并发数量创建web worker并发池
    this.pool = Array.from({length: maxWorkers}).map(() => {
      // 采用objectUrl或dataUrl的方式，会将代码写进字符串，就不需要新开文件创建worker
      // worker的代码直接打包进现有文件中，也不需要单独打包了
      // const blob = new Blob([hashWorkerStr], { type: 'application/javascript'});
      // const objectUrl = URL.createObjectURL(blob);
      const dataUrl = `data:application/javascript;utf8,${hashWorkerStr}`;
      return new WorkerWrapper(
        new Worker(dataUrl, { type: 'module' }),
        // 引入文件的方式创建web worker会对web worker文件进行单独打包
        // new Worker(new URL('./hash.worker.js', import.meta.url), { type: 'module' }),
        getData,
        postDate,
      );
    })
  }
}

export default workerPoolForHash;