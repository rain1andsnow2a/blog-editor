import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { publishPostFlow } from './github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_CONTENT_DIR = path.resolve(__dirname, '../../../blog/src/content/blog');
const LOCAL_DRAFTS_DIR = path.resolve(__dirname, '../../local-drafts');

const router = Router();

function sanitizeSlug(slug: unknown) {
  return String(slug || '').trim().replace(/[\\/]/g, '');
}

async function resolveDraft(slug: string) {
  const safeSlug = sanitizeSlug(slug);
  if (!safeSlug) return null;
  for (const ext of ['.md', '.mdx']) {
    const filePath = path.join(LOCAL_DRAFTS_DIR, `${safeSlug}${ext}`);
    try {
      await fs.access(filePath);
      return { filePath, filename: `${safeSlug}${ext}`, slug: safeSlug };
    } catch { /* keep searching */ }
  }
  return null;
}

// GET /api/drafts - 列出本地草稿箱
router.get('/', async (_req: Request, res: Response) => {
  try {
    let files: string[] = [];
    try {
      files = await fs.readdir(LOCAL_DRAFTS_DIR);
    } catch {
      return res.json([]);
    }

    const mdFiles = files.filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
    const drafts = await Promise.all(
      mdFiles.map(async (filename) => {
        const filePath = path.join(LOCAL_DRAFTS_DIR, filename);
        const raw = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(raw);
        const stat = await fs.stat(filePath);
        return {
          slug: filename.replace(/\.(md|mdx)$/, ''),
          filename,
          title: data.title || filename,
          pubDate: data.pubDate || stat.mtime.toISOString().split('T')[0],
        };
      })
    );

    drafts.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    res.json(drafts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/drafts/:slug/restore - 复制回博客内容目录并走单篇发布流程
router.post('/:slug/restore', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveDraft(req.params.slug);
    if (!resolved) return res.status(404).json({ error: '草稿不存在' });

    const targetPath = path.join(BLOG_CONTENT_DIR, resolved.filename);
    try {
      await fs.access(targetPath);
      return res.status(409).json({ error: '博客中已存在同名文章，请先处理冲突' });
    } catch { /* good, doesn't exist */ }

    await fs.copyFile(resolved.filePath, targetPath);
    const result = await publishPostFlow(resolved.slug);

    // 发布成功后才删除本地草稿备份
    await fs.unlink(resolved.filePath);
    res.json({ ...result, message: `已重新发布「${resolved.slug}」` });
  } catch (err: any) {
    res.status(500).json({ error: 'Restore failed', details: err.message || String(err) });
  }
});

// DELETE /api/drafts/:slug - 只删除本地草稿备份
router.delete('/:slug', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveDraft(req.params.slug);
    if (!resolved) return res.status(404).json({ error: '草稿不存在' });
    await fs.unlink(resolved.filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
