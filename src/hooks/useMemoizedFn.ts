import React, { useMemo, useRef } from 'react';

const useMemoizedFn = (fn: Function) => {
  const fnRef = useRef(fn);
  fnRef.current = useMemo(() => fn, [fn]);
  const memoizedRef = useRef();
  if (!memoizedRef.current) {
    // @ts-ignore
    return memoizedRef.current = function(...args: any) {
      fnRef.current.apply(this, args);
    }
  }
  return memoizedRef.current;
}

export default useMemoizedFn;