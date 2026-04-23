import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_CONTENT_DIR = path.resolve(__dirname, '../../../blog/src/content/blog');

const router = Router();

function normalizeCategory(category: unknown) {
  const value = String(category || '').trim();
  return value || '未分类';
}

// GET /api/posts - List all posts
router.get('/', async (_req, res) => {
  try {
    const files = await fs.readdir(BLOG_CONTENT_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

    const posts = await Promise.all(
      mdFiles.map(async (filename) => {
        const filePath = path.join(BLOG_CONTENT_DIR, filename);
        const raw = await fs.readFile(filePath, 'utf-8');
        const { data } = matter(raw);
        const stat = await fs.stat(filePath);
        return {
          slug: filename.replace(/\.(md|mdx)$/, ''),
          filename,
          title: data.title || filename,
          description: data.description || '',
          pubDate: data.pubDate || stat.mtime.toISOString().split('T')[0],
          category: normalizeCategory(data.category),
          tags: data.tags || [],
          updatedDate: data.updatedDate || null,
        };
      })
    );

    posts.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/posts/:slug - Get single post
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const possibleFiles = [`${slug}.md`, `${slug}.mdx`];
    let filePath = '';
    let filename = '';

    for (const f of possibleFiles) {
      const p = path.join(BLOG_CONTENT_DIR, f);
      try {
        await fs.access(p);
        filePath = p;
        filename = f;
        break;
      } catch { /* not found */ }
    }

    if (!filePath) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const raw = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(raw);

    res.json({
      slug,
      filename,
      frontmatter: {
        title: data.title || '',
        description: data.description || '',
        pubDate: data.pubDate ? new Date(data.pubDate).toISOString().split('T')[0] : '',
        category: normalizeCategory(data.category),
        tags: data.tags || [],
        updatedDate: data.updatedDate || null,
      },
      content: content.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/posts - Create new post
router.post('/', async (req, res) => {
  try {
    const { slug, frontmatter, content } = req.body;
    if (!slug || !frontmatter?.title) {
      return res.status(400).json({ error: 'slug and title are required' });
    }

    const filename = `${slug}.md`;
    const filePath = path.join(BLOG_CONTENT_DIR, filename);

    // Check if file already exists
    try {
      await fs.access(filePath);
      return res.status(409).json({ error: 'Post already exists' });
    } catch { /* good, doesn't exist */ }

    const fileContent = matter.stringify(content || '', {
      title: frontmatter.title,
      description: frontmatter.description || '',
      pubDate: frontmatter.pubDate || new Date().toISOString().split('T')[0],
      category: normalizeCategory(frontmatter.category),
      tags: frontmatter.tags || [],
    });

    await fs.writeFile(filePath, fileContent, 'utf-8');
    res.json({ success: true, slug, filename });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/posts/:slug - Update post
router.put('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { frontmatter, content } = req.body;

    const filename = `${slug}.md`;
    const filePath = path.join(BLOG_CONTENT_DIR, filename);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Post not found' });
    }

    const fm: Record<string, any> = {
      title: frontmatter.title,
      description: frontmatter.description || '',
      pubDate: frontmatter.pubDate,
      category: normalizeCategory(frontmatter.category),
      tags: frontmatter.tags || [],
    };
    if (frontmatter.updatedDate) {
      fm.updatedDate = frontmatter.updatedDate;
    }

    const fileContent = matter.stringify(content || '', fm);
    await fs.writeFile(filePath, fileContent, 'utf-8');
    res.json({ success: true, slug, filename });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/posts/:slug
router.delete('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const filePath = path.join(BLOG_CONTENT_DIR, `${slug}.md`);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
