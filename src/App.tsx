import { Routes, Route } from 'react-router-dom';
import PostList from './pages/PostList';
import Editor from './pages/Editor';
import ErrorBoundary from './components/ErrorBoundary';
import DesktopTitleBar from './components/DesktopTitleBar';

export default function App() {
  return (
    <ErrorBoundary>
      <DesktopTitleBar />
      <Routes>
        <Route path="/" element={<PostList />} />
        <Route path="/new" element={<Editor />} />
        <Route path="/edit/:slug" element={<ErrorBoundary><Editor /></ErrorBoundary>} />
      </Routes>
    </ErrorBoundary>
  );
}
