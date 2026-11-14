import React, { useRef, useEffect, useReducer, useState } from 'react';
import { Button, Progress, message } from 'antd';
import { SlideDown } from 'react-slidedown';
import SparkMD5 from 'spark-md5';
import axios from 'axios';

import { concurrentLimit } from 'src/tools/asyncload';
import workerPoolForHash from './workerPoolForHash';
import styles from './index.module.less';

// 常量定义
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_MAX_WORKERS = navigator.hardwareConcurrency || 4;

// 媒体类型枚举
enum MediaType {
  IMAGE_JPEG = 'image/jpeg',
  IMAGE_PNG = 'image/png',
  VIDEO_MP4 = 'video/mp4',
}

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
  signal: AbortSignal;
}

interface SourceInfo {
  url: string;
  type: string;
}

const initialState: UploadState = {
  checkPercent: 0,
  uploadPercent: 0,
}

const BaseUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:1111';

const reducer = (uploadState: UploadState, action: Action) => {
  switch (action.type) {
    case Type.Init:
      return { 
        checkPercent: 0,
        uploadPercent: 0,
      };
    case Type.Check:
      return { 
        ...uploadState,
        checkPercent: action.checkPercent ?? uploadState.checkPercent,
      };
    case Type.Upload: 
      return { 
        ...uploadState,
        uploadPercent: action.uploadPercent ?? uploadState.uploadPercent,
      };
    default: 
      return uploadState;
  }
}

const Upload = ({ 
  chunkSize = DEFAULT_CHUNK_SIZE,
  maxRequest = DEFAULT_MAX_CONCURRENT,
  maxWorkers = DEFAULT_MAX_WORKERS,
}: UploadProps) => {
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // 存储input标签实例
  const inputRef = useRef<HTMLInputElement>(null);
  // 保存workerPool的实例
  const workerPool = useRef<null | workerPoolForHash>(null);
  // @ts-ignore
  const [uploadState, dispatch] = useReducer(reducer, initialState);

  // 网络状态监测
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      message.success('网络已连接');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      message.warning('网络已断开，上传已暂停');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 清理 object URL
  useEffect(() => {
    return () => {
      if (sourceInfo?.url) {
        URL.revokeObjectURL(sourceInfo.url);
      }
    }
  }, []);

  // 通过文件的md5校验文件是否已经存在
  const checkFileIsExistByMd5 = async(
    fileName: string, 
    fileMd5Value: string
  ) => {
    const url = `${BaseUrl}/check/file?fileName=${fileName}&fileMd5Value=${fileMd5Value}`;
    return axios.get(url);
  }

  const upload = async({ i, file, fileMd5Value, chunks, needUploadNum, signal }: IUploadProps) => {
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
      signal,
    });
    // list是已经上传成功的分片列表 用于计算上传进度条
    const { stat, list } = data;
    if (stat) {
      const uploadPercent = Math.ceil((list.length / needUploadNum) * 100);
      dispatch({ type: Type.Upload, uploadPercent });
    }
    return data;
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
    await concurrentLimit(requestList, maxRequest, upload);
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

  // 处理文件选择
  const handleFileChange = async(file: File) => {
    if (!file) return;
    
    // 先清理旧的 URL，避免内存泄漏
    if (sourceInfo?.url) {
      URL.revokeObjectURL(sourceInfo.url);
    }
    
    // 立即创建本地预览，不依赖服务器响应
    const url = URL.createObjectURL(file);
    setSourceInfo({
      url,
      type: file.type,
    });
    
    // 检查网络状态
    if (!isOnline) {
      message.error('网络未连接，无法上传文件');
      return;
    }
    
    dispatch({ type: Type.Init });
    console.time('md5 compute');
    try {
      // 切片 并将分片分组
      const chunks = sliceChunks(file);
      const arrParts = handleChunkParts(chunks, maxWorkers);
      // 计算hash
      const fileMd5Value = await getChunksHash(arrParts, chunks.length);
      if (!fileMd5Value) {
        message.error('文件计算md5失败');
        return;
      }
      // 通过文件的md5校验文件是否已经存在
      const { data } = await checkFileIsExistByMd5(file.name, fileMd5Value);
      // 秒传
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
      const msg = error instanceof Error ? error.message : '上传失败';
      message.error(msg);
    }
  }

  // 处理文件切片
  const sliceChunks = (file: File) => {
    const chunks: Blob[] = [];
    const blobSlice = File.prototype.slice;
    let start = 0;
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
  // arrayBuffer是可转移对象,在线程之间转移时以快速且高效的零拷贝操作在上下文之间移动,对比Blob格式来讲在时间和空间上都有一定程度优化
  const getArrayBufferFromBlobs = async(chunks: Blob[]): Promise<ArrayBuffer[]> =>  {
    return Promise.all(chunks.map(chunk => chunk.arrayBuffer()));
  }

  // 判断是否为图片类型
  const isImageType = (type: string) => {
    return type === MediaType.IMAGE_JPEG || type === MediaType.IMAGE_PNG;
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
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleFileChange(file);
            }
          }}
        />
        <Button 
          type='primary' 
          onClick={() => inputRef.current?.click()}
          disabled={!isOnline}
        >
          {isOnline ? '上传' : '网络未连接'}
        </Button>
      </div>
      <div className={styles.sourceInfo}>
        {sourceInfo ? (
          isImageType(sourceInfo.type) ? 
            <img 
              className={styles.source} 
              src={sourceInfo.url}
              alt="uploaded" 
            /> :
            <video 
              className={styles.source} 
              src={sourceInfo.url}
              controls
            />
        ) : <div>资源待加载...</div>}
      </div>
      {uploadState.checkPercent > 0 ? (
        <SlideDown className={styles.slidedown}>
          <div className={styles.uploading}>
            <div>
              校验文件进度：
              <Progress 
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
              <Progress 
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
