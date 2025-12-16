import React, { lazy, Suspense, FC } from 'react';
import { Route, Routes, BrowserRouter } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';

// SplitChunksPlugin是webpack内置插件,不需要下载,可以直接使用
// SplitChunksPlugin默认对import()导入的异步模块生效,生成async chunks
const TimeSlicing = lazy(() => import(/* webpackChunkName: 'timeSlicing' */ './pages/TimeSlicing'));
const Exercise = lazy(() => import(/* webpackChunkName: 'exercise' */ './pages/Exercise'));
const Context = lazy(() => import(/* webpackChunkName: 'context' */ './pages/Context'));
const Demo = lazy(() => import(/* webpackChunkName: 'demo' */ './pages/Demo'));

const App: FC = () => {
  return (
    <BrowserRouter basename={process.env.WEB_APP_BASENAME || ''}>
    <ErrorBoundary>
    <Suspense fallback={<>loading</>}>
      <Routes>
        <Route key="exercise" path="/exercise" element={<Exercise />} />
        <Route key="timeSlicing" path="/timeSlicing" element={<TimeSlicing />} />
        <Route key="context" path="/context" element={<Context />} />
        <Route key="demo" path="/demo" element={<Demo />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  </BrowserRouter>
  );
};

export default App;
