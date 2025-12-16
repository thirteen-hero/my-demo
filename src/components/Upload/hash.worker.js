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