// @ts-ignore
const asyncLoadImage = (url: string): Promise[string] => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
      console.log('图片加载成功');
    }
    img.onerror = (error) => {
      reject(error);
    }
    img.src = url;
  })
}

const limitLoad = (requestList: any[], limit: number, request: any) => {
  const promises = requestList.slice(0, limit).map((item, index) => {
    return request(item)
      .then(() => index)
      .catch(() => {
        // 本处的重试逻辑是在limit限制的并发数量以外增加一次请求
        // 不关心重试成功或者失败 
        // 只把当前对应的index返回
        request(item)
          .then(() => index)
          .catch((error: any) => {
            console.log(error);
          })
        return index;
      })
  })
  return requestList.slice(limit).reduce((p, item) => {
    return p
      .then(() => Promise.race(promises)
        .then(fastestIndex => {
          promises[fastestIndex] = request(item)
            .then((() => fastestIndex))
            .catch(() => {
              // 本处的重试逻辑是在limit限制的并发数量以外增加一次请求
              // 不关心重试成功或者失败 
              // 只把当前对应的index返回
              request(item)
                .then(() => fastestIndex)
                .catch((error: any) => console.log(error))
              return fastestIndex;
            })
        })
      )
  }, Promise.resolve())
  .then(() => Promise.all(promises));
}

export {
  asyncLoadImage,
  limitLoad,
}