const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const formidable = require('formidable');

const uploadDir = 'nodeServer/uploads';
const app = express();

// 校验文件或文件夹是否已存在
const isExist = (filePath) => {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stats) => {
      // 文件夹不存在
      if (err && err.code === 'ENOENT') {
        resolve(false);
      } else {
        resolve(true);
      }
    })
  })
}

// 列出文件夹下所有文件
const listDir = (path) => {
  return new Promise((resolve, reject) => {
    fs.readdir(path, (err, data) => {
      if (err) {
        reject(err);
        return;
      } 
      // 把mac系统下的临时文件夹去掉
      if (data && data.length > 0 && data[0] === '.DS_Store') {
        data.splice(0, 1);
      }
      resolve(data);
    })
  })
}

// 获取文件chunk列表
const getChunkList = async(filePath, folderPath, callback) => {
  let result = {};
  const isFileExist = await isExist(filePath);
  if (isFileExist) {
    result = {
      stat: 1,
      file: {
        isExist: true,
        name: filePath,
      }, 
      desc: 'file is exist',
    }
  } else {
    const isFolderExist = await isExist(folderPath);
    let fileList = [];
    if (isFolderExist) {
      fileList = await listDir(folderPath);
    }
    result = {
      stat: 1, 
      chunkList: fileList,
      desc: 'folder list',
    }
  }
  callback(result);
}

// 文件夹是否存在 不存在则创建文件
const folderIsExist = async(folder) => {
  await fs.ensureDir(path.join(folder));
}

// 将一个文件复制到另一个文件
const copyFile = (src, dest, index) => {
  return new Promise((resolve, reject) => {
    // if (index === 2) {
    //   reject(index);
    // } else {
    //   fs.rename(src, dest, err => {
    //     if (err) {
    //       reject(index);
    //     } else {
    //       resolve(index);
    //     }
    //   })
    // }
    fs.rename(src, dest, err => {
      if (err) {
        reject(index);
      } else {
        resolve(index);
      }
    })
  })
}

// 合成文件
const mergeFiles = async(srcDir, targetDir, fileName, total) => {
  const { createWriteStream, createReadStream } = await import('fs');
  const fileArr = await listDir(srcDir);
  return new Promise((resolve, reject) => {
    if (fileArr.length < total) {
      resolve(false);
      return;
    }
    fileArr.sort((a, b) => a-b);
    // 把文件名加上文件夹的前缀
    const newFileArr = fileArr.map(item => `${srcDir}/${item}`);
    // 合并后文件的写入路径
    const outputFile = path.join(targetDir, fileName);
    // 创建一个可写流
    const writeStream = createWriteStream(outputFile);
    // 递归分块读写流文件
    const streamMergeRecursive = (newFileArr, writeStream) => {
      // 文件已写入到最后一个 关闭可写流 防止内存泄漏
      if (!newFileArr.length) {
        writeStream.end();
        resolve(true);
        return;
      }
      // 当前要读写的文件
      const currFile = newFileArr.shift();
      // 获取当前文件的可读流
      const currReadStream = createReadStream(currFile);
      // 将当前文件写入
      currReadStream.pipe(writeStream, { end: false });
      // 当前文件已读入 继续读入下个文件
      currReadStream.on('end', () => {
        streamMergeRecursive(newFileArr, writeStream);
      })
      // 监听错误事件 关闭可写流 防止内存泄漏
      currReadStream.on('error', () => {
        writeStream.close();
        resolve(false);
      })
    }
    streamMergeRecursive(newFileArr, writeStream);
  })
}

// 监听本地服务1111端口
app.listen(1111, () => {
  console.log('服务启动完成, 监听端口1111');
});

// 处理跨域
app.all('*', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Content-Length, Authorization, Accept, X-Requested-With',
  );
  res.header(
    'Access-Control-Allow-Methods', 'PUT', 'POST', 'GET', 'DELETE', 'OPTIONS'
  );
  res.header('X-Powered-By', '3.2.1');
  // 让options请求快速返回
  if (req.method === 'OPTIONS') {
    res.send(200);
  } else {
    next();
  }
})

// 检查md5接口
app.get('/check/file', (req, res) => {
  const { fileName, fileMd5Value } = req.query;
  getChunkList(
    path.join(uploadDir, fileName),
    path.join(uploadDir, fileMd5Value),
    data => res.send(data),
  );
})

// 上传文件接口
app.all('/upload', (req, res) => {
  const form = new formidable.IncomingForm({
    uploadDir: 'nodeServer/temp',
  });
  form.parse(req, async(err, fields, files) => {
    const index = fields.index;
    const fileMd5Value = fields.fileMd5Value;
    const old = path.resolve(__dirname, 'nodeServer/temp', files.data[0].newFilename);
    const folder = path.resolve(__dirname, uploadDir, fileMd5Value[0]);
    await folderIsExist(folder);
    const destFile = path.resolve(folder, index[0]);
    copyFile(old, destFile, Number(index[0]))
    .then(
      async(desc) => {
        const list = await listDir(folder);
        res.send({
          stat: 1,
          desc,
          list,
        });
      },
      (desc) => {
        res.status(404).json({ error: desc })
      }
    )
  })
})

// 合成文件接口
app.get('/merge', async(req, res) => {
  const { md5, fileName, total } = req.query;
  const data = await mergeFiles(path.join(uploadDir, md5), uploadDir, fileName, total);
  res.send({ 
    stat: data ? 1: 0
  });
})