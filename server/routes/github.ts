import { Router, Request, Response } from 'express';
import { execSync, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_ROOT = path.resolve(__dirname, '../../../blog');
const BLOG_CONTENT_DIR = path.join(BLOG_ROOT, 'src', 'content', 'blog');
const LOCAL_DRAFTS_DIR = path.resolve(__dirname, '../../local-drafts');

// 新代码统一用 execFile 参数数组形式，避免把 slug 插值进 shell
async function runGit(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: BLOG_ROOT,
    timeout: 30000,
    windowsHide: true,
    encoding: 'utf-8',
  } as any);
  return `${stdout || ''}${stderr || ''}`.trim();
}

async function runGitAllowFail(args: string[]): Promise<string> {
  try {
    return await runGit(args);
  } catch {
    return '';
  }
}

async function getCurrentBranch(): Promise<string> {
  const branch = await runGitAllowFail(['branch', '--show-current']);
  return branch.trim() || 'main';
}

async function resolvePostFile(slug: string) {
  const safeSlug = String(slug || '').trim().replace(/[\\/]/g, '');
  if (!safeSlug) return null;
  for (const ext of ['.md', '.mdx']) {
    const filePath = path.join(BLOG_CONTENT_DIR, `${safeSlug}${ext}`);
    try {
      await fs.access(filePath);
      return { filePath, filename: `${safeSlug}${ext}`, slug: safeSlug };
    } catch { /* keep searching */ }
  }
  return null;
}

// 单篇发布：只提交该文章文件 + public/uploads，绝不带走其他未提交改动
export async function publishPostFlow(slug: string) {
  const resolved = await resolvePostFile(slug);
  if (!resolved) throw new Error('文章不存在');

  const relPath = `src/content/blog/${resolved.filename}`;
  const paths = [relPath, 'public/uploads/'];

  await runGit(['add', '--', ...paths]);
  const staged = await runGitAllowFail(['diff', '--cached', '--name-only', '--', ...paths]);

  if (staged.trim()) {
    await runGit(['commit', '-m', `publish: ${resolved.slug}`, '--', ...paths]);
  } else {
    const ahead = await runGitAllowFail(['rev-list', '@{u}..HEAD', '--oneline', '--', relPath]);
    if (!ahead.trim()) {
      return { success: true, message: `「${resolved.slug}」已是最新，无需发布`, noop: true };
    }
  }

  const branch = await getCurrentBranch();
  const pushOutput = await runGit(['push', 'origin', branch]);
  return { success: true, message: `已发布「${resolved.slug}」`, details: pushOutput };
}

// 单篇撤回：备份到本地草稿箱 -> git rm -> scoped commit -> push
async function withdrawPostFlow(slug: string) {
  const resolved = await resolvePostFile(slug);
  if (!resolved) throw new Error('文章不存在');

  await fs.mkdir(LOCAL_DRAFTS_DIR, { recursive: true });
  const draftFilename = `${resolved.slug}.md`;
  await fs.copyFile(resolved.filePath, path.join(LOCAL_DRAFTS_DIR, draftFilename));

  const relPath = `src/content/blog/${resolved.filename}`;
  const tracked = await runGitAllowFail(['ls-files', '--error-unmatch', '--', relPath]);

  if (tracked.trim()) {
    await runGit(['rm', '-q', '--', relPath]);
    await runGit(['commit', '-m', `withdraw: ${resolved.slug}`, '--', relPath]);
    const branch = await getCurrentBranch();
    const pushOutput = await runGit(['push', 'origin', branch]);
    return {
      success: true,
      message: `已撤回「${resolved.slug}」，备份已存入草稿箱`,
      details: pushOutput,
      draft: draftFilename,
    };
  }

  await fs.unlink(resolved.filePath);
  return { success: true, message: `「${resolved.slug}」尚未进入版本库，已移入草稿箱`, draft: draftFilename };
}

const router = Router();

// POST /api/github/sync - Commit and push to GitHub
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const commitMsg = message || `Update blog content - ${new Date().toLocaleString('zh-CN')}`;

    const run = (cmd: string) =>
      execSync(cmd, { cwd: BLOG_ROOT, encoding: 'utf-8', timeout: 30000 });

    // Git status check
    const status = run('git status --porcelain');
    if (!status.trim()) {
      return res.json({ success: true, message: 'No changes to commit' });
    }

    run('git add -A');
    run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
    const pushOutput = run('git push origin main 2>&1');

    res.json({
      success: true,
      message: 'Synced to GitHub successfully',
      details: pushOutput.trim(),
    });
  } catch (err: any) {
    res.status(500).json({
      error: 'Sync failed',
      details: err.stderr || err.message || String(err),
    });
  }
});

// GET /api/github/status - Check git status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const run = (cmd: string) =>
      execSync(cmd, { cwd: BLOG_ROOT, encoding: 'utf-8', timeout: 10000 });

    const status = run('git status --porcelain');
    const branch = run('git branch --show-current').trim();
    const lastCommit = run('git log -1 --format="%h %s" 2>&1').trim();

    res.json({
      branch,
      lastCommit,
      hasChanges: status.trim().length > 0,
      changedFiles: status
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => line.trim()),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// POST /api/github/publish/:slug - Publish a single post (scoped commit + push)
router.post('/publish/:slug', async (req: Request, res: Response) => {
  try {
    const result = await publishPostFlow(req.params.slug);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Publish failed', details: err.message || String(err) });
  }
});

// POST /api/github/withdraw/:slug - Withdraw a single post (backup + git rm + push)
router.post('/withdraw/:slug', async (req: Request, res: Response) => {
  try {
    const result = await withdrawPostFlow(req.params.slug);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Withdraw failed', details: err.message || String(err) });
  }
});

export default router;
