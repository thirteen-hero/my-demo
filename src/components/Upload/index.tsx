import React, { useRef, useEffect, useReducer, useState } from 'react';
import { Button, Progress, message } from 'antd';
import { SlideDown } from 'react-slidedown';
import SparkMD5 from 'spark-md5';
import axios from 'axios';

import { limitLoad } from 'src/tools/asyncload';
import workerPoolForHash from './workerPoolForHash';
import styles from './index.module.less';
interface UploadProps {
  chunkSize?: number; // 切片大小
  maxRequest?: number; // 单次最大请求数量
  maxWorkers?: number; // web worker最大并发数量
}

interface UploadState {
  checkPercent: number;
  uploadPercent: number;
}

enum Type {
  Init = 'init',
  Check = 'check',
  Upload = 'upload',
}

interface Action {
  type: Type;
  checkPercent?: number;
  uploadPercent?: number;
}

interface IUploadProps {
  i: number;
  file: File;
  fileMd5Value: string;
  chunks: number;
  needUploadNum: number;
}

interface SourceInfo {
  url: string;
  type: string;
}

const initialState: UploadState = {
  checkPercent: 0,
  uploadPercent: 0,
}

const BaseUrl = 'http://localhost:1111';

const reducer = (uploadState: UploadState, action: Action) => {
  switch (action.type) {
    case Type.Init:
      uploadState.checkPercent = 0;
      uploadState.uploadPercent = 0;
      return { ...uploadState };
    case Type.Check:
      uploadState.checkPercent = action.checkPercent ?? uploadState.checkPercent;
      return { ...uploadState };
    case Type.Upload: 
      uploadState.uploadPercent = action.uploadPercent ?? uploadState.uploadPercent;
      return { ... uploadState };
    default: 
      return {
        checkPercent: uploadState.checkPercent,
        uploadPercent: uploadState.uploadPercent,
      }
  }
}

const Upload = ({ 
  // 默认切片大小
  chunkSize = 5 * 1024 *1024, 
  // 默认单次最大请求数量
  maxRequest = 5, 
  // 默认最大并发线程数量
  maxWorkers = navigator.hardwareConcurrency,
}: UploadProps) => {
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);
  // 存储input标签实例
  const inputRef = useRef(null);
  // 保存workerPool的实例
  const workerPool = useRef<null | workerPoolForHash>(null);
  // @ts-ignore
  const [uploadState, dispatch] = useReducer(reducer, initialState);

  // 将文件切片并转换成md5
  // const md5File = (file: File) => {
  //   return new Promise((resolve, reject) => {
  //     // 用于文件分片
  //     const blobSlice = File.prototype.slice;
  //     // 最终文件的分片数
  //     const chunks = Math.ceil(file?.size / chunkSize);
  //     const spark = new SparkMD5.ArrayBuffer();
  //     // 异步读取用户存储在计算机上的文件
  //     const fileReader = new FileReader();
  //     // 文件读取成功回调
  //     fileReader.onload = (e) => {
  //       // 将读取到的分片添加进去直到全部读取完毕生成唯一的md5值
  //       // @ts-ignore
  //       spark.append(e.target.result);
  //       checkCurrentChunk += 1;
  //       if (checkCurrentChunk < chunks) {
  //         loadNext();
  //       } else {
  //         const result = spark.end();
  //         resolve(result);
  //       }
  //     }
  //     // 文件读取失败回调
  //     fileReader.onerror = (e) => {
  //       reject('文件读取错误');
  //     }

  //     // 进行文件分片
  //     const loadNext = () => {
  //       const start = checkCurrentChunk * chunkSize;
  //       const end = start + chunkSize >= file.size ? file.size : start + chunkSize;
  //       // 读取文件分片并返回一个包含文件数据的ArrayBuffer对象
  //       fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
  //       // 检查进度条
  //       dispatch({ type: Type.Check, checkPercent: Math.ceil((checkCurrentChunk + 1)/chunks * 100) });
  //     }

  //     loadNext();
  //   })
  // }

  // 通过文件的md5校验文件是否已经存在
  const checkFileIsExistByMd5 = async(
    fileName: string, 
    fileMd5Value: string
  ) => {
    const url = `${BaseUrl}/check/file?fileName=${fileName}&fileMd5Value=${fileMd5Value}`;
    return axios.get(url);
  }

  const upload = async({ i, file, fileMd5Value, chunks, needUploadNum }: IUploadProps) => {
    const end = (i + 1) * chunkSize >= file.size ? file.size : (i + 1) * chunkSize;
    const form = new FormData();
    form.append('data', file.slice(i * chunkSize, end));
    form.append('total', `${chunks}`);
    form.append('index', `${i}`);
    form.append('fileMd5Value', fileMd5Value);
    const { data } = await axios({
      method: 'post',
      url: BaseUrl + "/upload",
      data: form,
    });
    // list是已经上传成功的分片列表 用于计算上传进度条
    const { stat, list } = data;
    if (stat) {
      const uploadPercent = Math.ceil((list.length / needUploadNum) * 100);
      dispatch({ type: Type.Upload, uploadPercent });
    }
  }

  // 上传chunk
  const checkAndUploadChunk = async(file: File, fileMd5Value: any, chunkList: any) => {
    const chunks = Math.ceil(file.size / chunkSize);
    // 需要上传的分片数 用于计算上传进度条
    const needUploadNum = chunks - chunkList.length;
    const requestList = [];
    for(let i = 0; i < chunks; i++) {
      const exist = chunkList.indexOf(`${i}`) > -1;
      // 如果不存在 则上传
      if (!exist) {
        requestList.push({ i, file, fileMd5Value, chunks, needUploadNum});
      }
    }
    await limitLoad(requestList, maxRequest, upload);
  }

  // 所有分片上传完成 准备合成
  const notifyServer = async(file: File, fileMd5Value: any) => {
    const chunks = Math.ceil(file.size / chunkSize);
    const url = `${BaseUrl}/merge?md5=${fileMd5Value}&fileName=${file.name}&size=${file.size}&total=${chunks}`;
    const { data } = await axios.get(url);
    if (data.stat) {
      message.success('文件上传成功');
    } else {
      message.error('文件上传失败');
    }
  }

  // 绑定change事件 监听上传文件变化
  useEffect(() => {
    const fileChange = ({ target }: any) => {
      dispatch({ type: Type.Init });
      // 获取<input type='file' />标签选择的文件列表
      // target.files就是一个FileList对象
      const file = target.files[0];
      handleFileChange(file);
    }
    document.addEventListener('change', fileChange);
    return () => {
      document.removeEventListener('change', fileChange);
    }
  }, []);

  // 用户选择文件发生变化 处理上传逻辑
  const handleFileChange = async(file: File) => {
    const fileReader = new FileReader();
    // 文件读取成功回调
    fileReader.onload = (e) => {
      // 资源预览
      setSourceInfo({
        // @ts-ignore
        url: e.target.result,
        type: file.type,
      });
    }
    fileReader.readAsDataURL(file);
    
    try {
      console.time('md5 compute');
      // 获取文件的md5值
      // const fileMd5Value = await md5File(file);
      // 文件分片
      const chunksBlob = sliceChunks(file);
      // 将文件分片进行分组
      const chunkParts = handleChunkParts(chunksBlob, maxWorkers);
      // 计算文件唯一的md5值
      const fileMd5Value = await getChunksHash(
        chunkParts, 
        chunksBlob.length
      );
      if (!fileMd5Value) {
        message.error('未计算出文件md5值,请重试');
        return;
      }
      // 校验文件的md5
      // @ts-ignore
      const { data } = await checkFileIsExistByMd5(file.name, fileMd5Value);
      // 如果文件已存在 就秒传
      if (data?.file) {
        message.success('文件已秒传');
        return;
      }
      // 检查并上传切片
      await checkAndUploadChunk(file, fileMd5Value, data.chunkList);
      console.timeEnd('md5 compute');
      // 通知服务器所有分片已上传完成
      await notifyServer(file, fileMd5Value);
    } catch (error) {
      // @ts-ignore
      message.error(error?.message);
    }
  }

  // 处理文件切片
  const sliceChunks = (file: File) => {
    const chunks: Blob[] = [];
    const blobSlice = File.prototype.slice;
    let start = 0 * chunkSize;
    while (start < file.size) {
      chunks.push(blobSlice.call(file, start, start + chunkSize));
      start += chunkSize;
    }
    return chunks;
  }

  // 对文件分片进行分组
  // 根据web worker最大并发数创建一个二维数组,每个子数组的长度为最大并发数
  const handleChunkParts = (chunks: Blob[], size: number) => {
    const result: Blob[][] = [];
    let tempPart: Blob[] = [];
    chunks.forEach((chunk: Blob) => {
      tempPart.push(chunk);
      if (tempPart.length === size) {
        result.push(tempPart);
        tempPart = [];
      }
    })
    if (tempPart.length !== 0) result.push(tempPart);
    return result;
  }

  // 获取文件唯一的md5值
  const getChunksHash = async(arrParts: Blob[][], total: number) => {
    let chunksArrayBuffer: ArrayBuffer[] = [];
    let result: any;
    let hash;
    const spark = new SparkMD5();
    // 根据最大并发数量的分组,组内任务并行执行,组外任务串行执行
    const tasks = arrParts.map((part: Blob[]) => async() => {
      chunksArrayBuffer.length = 0;
      chunksArrayBuffer = await getArrayBufferFromBlobs(part);
      // 使用useRef存储workerPool实例对象,不必每次创建新的web worker,每组并发任务执行完毕后都可复用
      if (!workerPool.current) {
        workerPool.current = new workerPoolForHash(part.length);
      }
      // 执行workerPool.exec函数,处理组内并发逻辑
      return workerPool.current.exec(chunksArrayBuffer);
    })
    for (const task of tasks) {
      // 执行每组分片的promise
      result = await task();
      const checkPercent = Math.ceil((result.length / total) * 100);
      dispatch({ type: Type.Check, checkPercent });
    }
    // 线程池内的任务执行完毕后关闭线程,清空线程池
    workerPool.current?.terminate();
    workerPool.current = null;
    // 处理计算结果
    // 异常处理
    // 无异常的话对分片的哈希进行二次哈希,生成一个唯一的哈希值,用于标识文件是否已存在
    for (let i = 0; i < result.length; i++) {
      if (typeof result[i] !== 'string') {
        hash = undefined;
        break;
      }
      if (i < result.length - 1) {
        spark.append(result[i]);
      } else {
        spark.append(result[i]);
        hash = spark.end();
      }
    }
    return hash;
  }

  // 将分片后的文件转化为arrayBuffer格式
  // arrayBuffer是可转移对象,在线程之间转移时以快速且高效的零拷贝操作在上下文之间移动,对比Blob格式来讲在事件和空间上都有一定程度优化
  const getArrayBufferFromBlobs = async(chunks: Blob[]): Promise<ArrayBuffer[]> =>  {
    return Promise.all(chunks.map(chunk => chunk.arrayBuffer()));
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.upload}>
        <p>点击上传文件:</p>
        <input 
          ref={inputRef} 
          type='file' 
          id='file' 
          style={{ display: 'none' }} 
        />
        <Button 
          type='primary' 
          // @ts-ignore
          onClick={() => inputRef.current?.click()}
        >
          上传
        </Button>
      </div>
      {sourceInfo && (
        sourceInfo.type === 'image/jpeg' ? 
          <img 
            className={styles.source} 
            src={sourceInfo.url} 
          /> :
          <
            video className={styles.source} 
            src={sourceInfo.url} 
            controls
          />
      )}
      {uploadState.checkPercent > 0 ? (
        <SlideDown className={styles.slidedown}>
          <div className={styles.uploading}>
            <div>
              校验文件进度：
              < Progress 
                style={{width: 200}} 
                percent={uploadState.checkPercent} 
              />
            </div>
          </div>
        </SlideDown>
      ) : null}
      {uploadState.uploadPercent > 0 ? (
        <SlideDown className={styles.slidedown}>
          <div className={styles.uploading}>
            <div>
              上传文件进度：
              < Progress 
                style={{ width: 200 }}
                percent={uploadState.uploadPercent} 
              />
            </div>
          </div>
        </SlideDown>
      ) : null}
    </div>
  )
}

export default Upload;