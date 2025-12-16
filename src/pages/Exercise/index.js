import React, { useState, useEffect } from 'react';

import styles from './index.module.less';

const Exercise = () => {
  return (
    <div className={styles.box}
      onClick={() => {
        console.log(333);
      }}
    >
      <div 
        className={styles.top}
        onClick={(e) => {
          e.stopPropagation()
          console.log(111)
        }} 
        onClickCapture={() => {
          console.log(222)
        }} 
      />
      <div className={styles.bottom}>
        你好你好你
      </div>
    </div>
  )
}

export default Exercise;