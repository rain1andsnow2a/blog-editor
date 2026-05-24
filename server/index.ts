import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import postsRouter from './routes/posts.js';
import uploadRouter from './routes/upload.js';
import githubRouter from './routes/github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3456;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve uploaded images
const blogRoot = path.resolve(__dirname, '../../blog');
app.use('/uploads', express.static(path.join(blogRoot, 'public/uploads')));

app.use('/api/posts', postsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/github', githubRouter);

app.listen(PORT, () => {
  console.log(`\n  ✏️  Blog Editor API running at http://localhost:${PORT}`);
  console.log(`  📁 Blog root: ${blogRoot}\n`);
});
