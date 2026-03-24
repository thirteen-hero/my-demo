import WorkerPool from 'src/tools/workerPool';
import WorkerWrapper from 'src/tools/workerWrapper';

const hashWorkerStr = `
  import SparkMD5 from 'https://esm.sh/spark-md5@3.0.2';
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
// 针对objectUrl回收问题
// Worker的加载机制: 当new Worker(url)时,浏览器会立即发起一个网络请求（或者是读取Blob引用）来获取脚本内容。一旦脚本内容被下载并解析到Worker的独立内存空间中,那个objectUrl的使命就完成了。
// 为什么要回收: URL.createObjectURL是在浏览器的内存表中注册了一个映射关系。如果不回收,这个映射关系会一直存在,直到页面关闭。如果在循环中大量创建Blob URL而不回收,会导致内存泄漏。
// Data URL 的对比: dataUrl方式是不需要回收的,因为它是自包含的字符串,不占用浏览器的Blob映射表。但Data URL在调试和SourceMap支持上不如Blob URL友好。

// 针对大文件上传的workerPool类 继承了workerPool类
class workerPoolForHash extends WorkerPool {
  pool: WorkerWrapper[] = [];

  constructor(maxWorkers: number) {
    super(maxWorkers);
    // 根据最大并发数量创建web worker并发池
    this.pool = Array.from({length: maxWorkers}).map(() => {
      // 采用objectUrl或dataUrl的方式，会将代码写进字符串，就不需要新开文件创建worker
      // worker的代码直接打包进现有文件中，也不需要单独打包了
      const blob = new Blob([hashWorkerStr], { type: 'application/javascript'});
      const objectUrl = URL.createObjectURL(blob);
      // const dataUrl = `data:text/javascript;charset=utf8,${encodeURIComponent(hashWorkerStr)}`;
        const worker = new Worker(objectUrl, { type: 'module' });
        // const worker = new Worker(dataUrl, { type: 'module' }),
        // 引入文件的方式创建web worker会对web worker文件进行单独打包
        // const worker = new Worker(new URL('./hash.worker.js', import.meta.url), { type: 'module' }),

        // 此时 Worker 已经读取了脚本内容，不再依赖这个 URL 了
        // 这里的回收是同步的，非常安全
        URL.revokeObjectURL(objectUrl);
      return new WorkerWrapper(worker);
    })
  }
}

export default workerPoolForHash;