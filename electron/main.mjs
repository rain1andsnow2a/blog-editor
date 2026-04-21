import { app, BrowserWindow, ipcMain, net, protocol, dialog } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import matter from 'gray-matter';
import { fileURLToPath, pathToFileURL } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const DEFAULT_BLOG_ROOT = process.env.BLOG_ROOT
  ? path.resolve(process.env.BLOG_ROOT)
  : path.resolve(APP_ROOT, '../blog');
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5177';
const INDEX_HTML = path.join(APP_ROOT, 'dist', 'index.html');
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const WINDOW_ICON_PATH = path.join(APP_ROOT, 'assets', 'icon.png');

let appConfig = {
  blogRoot: DEFAULT_BLOG_ROOT,
  branch: 'main',
  remoteName: 'origin',
  remoteUrl: '',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function sanitizeSlug(slug) {
  return String(slug || '').trim().replace(/[\\/]/g, '');
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isBlogRoot(candidateRoot) {
  const contentDir = path.join(candidateRoot, 'src', 'content', 'blog');
  const packageJsonPath = path.join(candidateRoot, 'package.json');
  const astroConfigPath = path.join(candidateRoot, 'astro.config.mjs');
  const astroConfigTsPath = path.join(candidateRoot, 'astro.config.ts');
  const [hasContentDir, hasPackageJson, hasAstroConfig, hasAstroConfigTs] = await Promise.all([
    pathExists(contentDir),
    pathExists(packageJsonPath),
    pathExists(astroConfigPath),
    pathExists(astroConfigTsPath),
  ]);

  return hasContentDir && hasPackageJson && (hasAstroConfig || hasAstroConfigTs);
}

async function resolveBlogRoot(candidateRoot) {
  const resolved = path.resolve(String(candidateRoot || '').trim() || DEFAULT_BLOG_ROOT);
  const attempts = [
    resolved,
    path.resolve(resolved, '..'),
    path.resolve(resolved, '..', '..'),
    path.resolve(resolved, '..', '..', '..'),
    path.resolve(resolved, '..', '..', '..', '..'),
  ];

  for (const attempt of attempts) {
    if (await isBlogRoot(attempt)) {
      return attempt;
    }
  }

  throw new Error('请选择博客项目根目录，目录中需要包含 src/content/blog');
}

async function resolvePostFile(slug) {
  const safeSlug = sanitizeSlug(slug);
  const blogContentDir = getBlogContentDir();
  for (const ext of ['.md', '.mdx']) {
    const filePath = path.join(blogContentDir, `${safeSlug}${ext}`);
    try {
      await fs.access(filePath);
      return { filePath, filename: `${safeSlug}${ext}`, slug: safeSlug };
    } catch {
      // Keep searching.
    }
  }
  return null;
}

async function ensureDirectories() {
  if (!(await isBlogRoot(getBlogRoot()))) {
    throw new Error(`当前博客目录无效: ${getBlogRoot()}。请选择包含 src/content/blog 的博客项目根目录。`);
  }
  await fs.mkdir(getBlogContentDir(), { recursive: true });
  await fs.mkdir(getUploadDir(), { recursive: true });
}

async function runGit(args) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: getBlogRoot(),
    timeout: 30000,
    windowsHide: true,
    encoding: 'utf-8',
  });

  return `${stdout || ''}${stderr || ''}`.trim();
}

function getBlogRoot() {
  return appConfig.blogRoot;
}

function getBlogContentDir() {
  return path.join(getBlogRoot(), 'src', 'content', 'blog');
}

function getUploadDir() {
  return path.join(getBlogRoot(), 'public', 'uploads');
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const resolvedBlogRoot = parsed.blogRoot
      ? await resolveBlogRoot(parsed.blogRoot)
      : appConfig.blogRoot;
    appConfig = {
      ...appConfig,
      ...parsed,
      blogRoot: resolvedBlogRoot,
    };
  } catch {
    // Use defaults when config is missing or invalid.
  }
}

async function writeConfig() {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(appConfig, null, 2), 'utf-8');
}

async function detectRemoteUrl() {
  try {
    const remoteUrl = await runGit(['remote', 'get-url', appConfig.remoteName]);
    appConfig.remoteUrl = remoteUrl.trim();
    await writeConfig();
  } catch {
    // Remote may not exist yet.
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#ffffff',
    icon: WINDOW_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ['http://localhost:5177/uploads/*', 'https://localhost:5177/uploads/*'] },
    (details, callback) => {
      const redirectURL = details.url.replace(/^https?:\/\/localhost:5177/, 'app://.');
      callback({ redirectURL });
    }
  );

  if (app.isPackaged) {
    await win.loadURL('app://./index.html');
  } else {
    await win.loadURL(RENDERER_URL);
  }
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/uploads/')) {
      const resolvedBlogRoot = getBlogRoot();
      const assetPath = path.join(resolvedBlogRoot, 'public', pathname);
      return net.fetch(pathToFileURL(assetPath).toString());
    }

    let targetPath = path.join(APP_ROOT, 'dist', pathname);
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        targetPath = path.join(targetPath, 'index.html');
      }
    } catch {
      targetPath = INDEX_HTML;
    }

    return net.fetch(pathToFileURL(targetPath).toString());
  });
}

ipcMain.handle('posts:list', async () => {
  await ensureDirectories();
  const blogContentDir = getBlogContentDir();
  const files = await fs.readdir(blogContentDir);
  const mdFiles = files.filter((file) => file.endsWith('.md') || file.endsWith('.mdx'));

  const posts = await Promise.all(
    mdFiles.map(async (filename) => {
        const filePath = path.join(blogContentDir, filename);
      const raw = await fs.readFile(filePath, 'utf-8');
      const { data } = matter(raw);
      const stat = await fs.stat(filePath);

      return {
        slug: filename.replace(/\.(md|mdx)$/, ''),
        filename,
        title: data.title || filename,
        description: data.description || '',
        pubDate: data.pubDate || stat.mtime.toISOString().split('T')[0],
        tags: data.tags || [],
        updatedDate: data.updatedDate || null,
      };
    })
  );

  posts.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  return posts;
});

ipcMain.handle('posts:get', async (_event, slug) => {
  const resolved = await resolvePostFile(slug);
  if (!resolved) {
    throw new Error('Post not found');
  }

  const raw = await fs.readFile(resolved.filePath, 'utf-8');
  const { data, content } = matter(raw);

  return {
    slug: resolved.slug,
    filename: resolved.filename,
    frontmatter: {
      title: data.title || '',
      description: data.description || '',
      pubDate: data.pubDate ? new Date(data.pubDate).toISOString().split('T')[0] : '',
      tags: data.tags || [],
      updatedDate: data.updatedDate || null,
    },
    content: content.trim(),
  };
});

ipcMain.handle('posts:create', async (_event, payload) => {
  const slug = sanitizeSlug(payload?.slug);
  const frontmatter = payload?.frontmatter || {};
  const content = payload?.content || '';

  if (!slug || !frontmatter.title) {
    throw new Error('slug and title are required');
  }

  await ensureDirectories();
  const filename = `${slug}.md`;
  const BLOG_CONTENT_DIR = getBlogContentDir();
  const filePath = path.join(BLOG_CONTENT_DIR, filename);

  try {
    await fs.access(filePath);
    throw new Error('Post already exists');
  } catch (error) {
    if (error.message === 'Post already exists') {
      throw error;
    }
  }

  const fileContent = matter.stringify(content, {
    title: frontmatter.title,
    description: frontmatter.description || '',
    pubDate: frontmatter.pubDate || new Date().toISOString().split('T')[0],
    tags: frontmatter.tags || [],
  });

  await fs.writeFile(filePath, fileContent, 'utf-8');
  return { success: true, slug, filename };
});

ipcMain.handle('posts:update', async (_event, slug, payload) => {
  const resolved = await resolvePostFile(slug);
  if (!resolved) {
    throw new Error('Post not found');
  }

  const frontmatter = payload?.frontmatter || {};
  const content = payload?.content || '';
  const fm = {
    title: frontmatter.title || '',
    description: frontmatter.description || '',
    pubDate: frontmatter.pubDate || '',
    tags: frontmatter.tags || [],
  };

  if (frontmatter.updatedDate) {
    fm.updatedDate = frontmatter.updatedDate;
  }

  const fileContent = matter.stringify(content, fm);
  await fs.writeFile(resolved.filePath, fileContent, 'utf-8');

  return { success: true, slug: resolved.slug, filename: resolved.filename };
});

ipcMain.handle('posts:delete', async (_event, slug) => {
  const resolved = await resolvePostFile(slug);
  if (!resolved) {
    throw new Error('Post not found');
  }

  await fs.unlink(resolved.filePath);
  return { success: true };
});

ipcMain.handle('images:upload', async (_event, payload) => {
  const filename = String(payload?.name || '');
  const bytes = payload?.bytes;
  const ext = path.extname(filename);
  const allowed = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i;

  if (!allowed.test(ext)) {
    throw new Error('Only image files are allowed');
  }

  const buffer = Buffer.from(bytes || []);
  const maxSize = 10 * 1024 * 1024;
  if (buffer.byteLength > maxSize) {
    throw new Error('Image must be 10MB or smaller');
  }

  await ensureDirectories();
  const UPLOAD_DIR = getUploadDir();
  const targetName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const targetPath = path.join(UPLOAD_DIR, targetName);
  await fs.writeFile(targetPath, buffer);

  return {
    url: `/uploads/${targetName}`,
    filename: targetName,
  };
});

ipcMain.handle('git:status', async () => {
  const status = await runGit(['status', '--porcelain']);
  const branch = await runGit(['branch', '--show-current']);
  const lastCommit = await runGit(['log', '-1', '--format=%h %s']);
  let remoteUrl = '';
  try {
    remoteUrl = await runGit(['remote', 'get-url', appConfig.remoteName]);
  } catch {
    remoteUrl = appConfig.remoteUrl || '';
  }

  return {
    branch: branch.trim(),
    lastCommit: lastCommit.trim(),
    remoteUrl: remoteUrl.trim(),
    hasChanges: status.trim().length > 0,
    changedFiles: status
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.trim()),
  };
});

ipcMain.handle('git:sync', async (_event, message) => {
  const status = await runGit(['status', '--porcelain']);
  if (!status.trim()) {
    return { success: true, message: 'No changes to commit' };
  }

  const commitMsg = String(message || `Update blog content - ${new Date().toLocaleString('zh-CN')}`);
  let branch = appConfig.branch;
  try {
    branch = (await runGit(['branch', '--show-current'])).trim() || branch;
  } catch {
    // Keep configured branch fallback.
  }
  await runGit(['add', '-A']);
  await runGit(['commit', '-m', commitMsg]);
  const pushOutput = await runGit(['push', appConfig.remoteName, branch]);

  return {
    success: true,
    message: 'Synced to GitHub successfully',
    details: pushOutput,
  };
});

ipcMain.handle('app:info', async () => ({
  blogRoot: getBlogRoot(),
  uploadDir: getUploadDir(),
  remoteUrl: appConfig.remoteUrl,
  remoteName: appConfig.remoteName,
  branch: appConfig.branch,
}));

ipcMain.handle('settings:get', async () => {
  const normalizedBlogRoot = await resolveBlogRoot(getBlogRoot());
  if (normalizedBlogRoot !== appConfig.blogRoot) {
    appConfig.blogRoot = normalizedBlogRoot;
    await writeConfig();
  }
  await detectRemoteUrl();
  return {
    blogRoot: getBlogRoot(),
    remoteUrl: appConfig.remoteUrl,
    remoteName: appConfig.remoteName,
    branch: appConfig.branch,
  };
});

ipcMain.handle('settings:chooseBlogRoot', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择博客项目目录',
    properties: ['openDirectory'],
    defaultPath: getBlogRoot(),
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('settings:update', async (_event, payload) => {
  const nextBlogRoot = payload?.blogRoot
    ? await resolveBlogRoot(payload.blogRoot)
    : await resolveBlogRoot(getBlogRoot());
  const nextRemoteUrl = String(payload?.remoteUrl || '').trim();
  const nextRemoteName = String(payload?.remoteName || appConfig.remoteName || 'origin').trim() || 'origin';

  appConfig.blogRoot = nextBlogRoot;
  appConfig.remoteName = nextRemoteName;

  try {
    const existingBranch = await runGit(['branch', '--show-current']);
    appConfig.branch = existingBranch.trim() || appConfig.branch || 'main';
  } catch {
    appConfig.branch = appConfig.branch || 'main';
  }

  if (nextRemoteUrl) {
    try {
      await runGit(['remote', 'set-url', nextRemoteName, nextRemoteUrl]);
    } catch {
      await runGit(['remote', 'add', nextRemoteName, nextRemoteUrl]);
    }
    appConfig.remoteUrl = nextRemoteUrl;
  } else {
    await detectRemoteUrl();
  }

  await ensureDirectories();
  await writeConfig();

  return {
    success: true,
    blogRoot: getBlogRoot(),
    remoteUrl: appConfig.remoteUrl,
    remoteName: appConfig.remoteName,
    branch: appConfig.branch,
  };
});

app.whenReady().then(async () => {
  await readConfig();
  await ensureDirectories();
  await detectRemoteUrl();
  registerAppProtocol();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
