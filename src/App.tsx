import { Routes, Route } from 'react-router-dom';
import PostList from './pages/PostList';
import Editor from './pages/Editor';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PostList />} />
      <Route path="/new" element={<Editor />} />
      <Route path="/edit/:slug" element={<Editor />} />
    </Routes>
  );
}
