import { Router, Request, Response } from 'express';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_ROOT = path.resolve(__dirname, '../../../blog');

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

export default router;
