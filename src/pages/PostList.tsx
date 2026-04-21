import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchPosts,
  deletePost,
  syncToGitHub,
  getGitStatus,
  getSettings,
  updateSettings,
  chooseBlogRoot,
  type PostMeta,
  type GitStatus,
  type BlogSettings,
} from '../lib/api';
import { Plus, Trash2, Edit3, GitBranch, Upload, FileText, Tag, Clock, Settings, FolderOpen, X } from 'lucide-react';

export default function PostList() {
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [settings, setSettings] = useState<BlogSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<BlogSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([fetchPosts(), getGitStatus()]);
      setPosts(p);
      setGitStatus(g);
      try {
        const s = await getSettings();
        setSettings(s);
        setSettingsDraft(s);
      } catch {
        // Settings are desktop-only.
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (slug: string, title: string) => {
    if (!confirm(`确定要删除「${title}」吗？`)) return;
    await deletePost(slug);
    load();
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const result = await syncToGitHub();
      setSyncMsg(result.message);
      await load();
    } catch (err: any) {
      setSyncMsg('同步失败: ' + (err.message || String(err)));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  const openSettings = async () => {
    try {
      const s = await getSettings();
      setSettings(s);
      setSettingsDraft(s);
      setShowSettings(true);
    } catch (err) {
      setSyncMsg('当前只有桌面版支持设置博客目录和仓库地址');
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  const handlePickBlogRoot = async () => {
    try {
      const selected = await chooseBlogRoot();
      if (selected) {
        setSettingsDraft((prev) => prev ? { ...prev, blogRoot: selected } : prev);
      }
    } catch (err: any) {
      setSyncMsg('选择目录失败: ' + (err.message || String(err)));
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    setSavingSettings(true);
    try {
      const updated = await updateSettings({
        blogRoot: settingsDraft.blogRoot,
        remoteUrl: settingsDraft.remoteUrl,
        remoteName: settingsDraft.remoteName,
      });
      setSettings(updated);
      setSettingsDraft(updated);
      setShowSettings(false);
      setSyncMsg('设置已保存');
      await load();
    } catch (err: any) {
      setSyncMsg('保存设置失败: ' + (err.message || String(err)));
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-notion-border sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-notion-text" />
            <h1 className="text-lg font-semibold text-notion-text">Blog Editor</h1>
          </div>
          <div className="flex items-center gap-2">
            {settings && (
              <div className="hidden xl:flex items-center gap-3 text-xs text-notion-text-secondary mr-2 max-w-[420px]">
                <span className="truncate" title={settings.blogRoot}>目录: {settings.blogRoot}</span>
                {settings.remoteUrl && (
                  <span className="truncate" title={settings.remoteUrl}>仓库: {settings.remoteUrl}</span>
                )}
              </div>
            )}
            {/* Git status */}
            {gitStatus && (
              <div className="flex items-center gap-1.5 text-xs text-notion-text-secondary mr-2">
                <GitBranch className="w-3.5 h-3.5" />
                <span>{gitStatus.branch}</span>
                {gitStatus.hasChanges && (
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                    有未同步更改
                  </span>
                )}
              </div>
            )}
            <button
              onClick={openSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-notion-border text-notion-text rounded-md hover:bg-notion-bg-hover transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              设置
            </button>
            <button
              onClick={handleSync}
              disabled={syncing || !gitStatus?.hasChanges}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-notion-text text-white rounded-md hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {syncing ? '同步中...' : '同步到 GitHub'}
            </button>
            <button
              onClick={() => navigate('/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-notion-accent text-white rounded-md hover:bg-notion-accent-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              新文章
            </button>
          </div>
        </div>
      </header>

      {/* Sync message toast */}
      {syncMsg && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 bg-notion-text text-white text-sm rounded-lg shadow-lg animate-fade-in">
          {syncMsg}
        </div>
      )}

      {showSettings && settingsDraft && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
        >
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-notion-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-notion-border">
              <div>
                <h2 className="text-lg font-semibold text-notion-text">博客设置</h2>
                <p className="text-sm text-notion-text-secondary mt-1">在这里选择本地博客目录，并修改推送使用的 GitHub 仓库地址。</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-md hover:bg-notion-bg-hover transition-colors"
              >
                <X className="w-4 h-4 text-notion-text-secondary" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-notion-text mb-2">本地博客目录</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settingsDraft.blogRoot}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, blogRoot: e.target.value })}
                    placeholder="例如：D:\\bigproject\\blog"
                    className="flex-1 px-3 py-2 text-sm border border-notion-border rounded-md focus:outline-none focus:border-notion-accent"
                  />
                  <button
                    onClick={handlePickBlogRoot}
                    className="px-3 py-2 text-sm border border-notion-border rounded-md hover:bg-notion-bg-hover transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-4 h-4" />
                    选择目录
                  </button>
                </div>
                <p className="text-xs text-notion-text-secondary mt-2">应选择博客项目根目录，也就是里面包含 `src/content/blog` 和 `public/uploads` 的目录。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-notion-text mb-2">GitHub 仓库地址</label>
                <input
                  type="text"
                  value={settingsDraft.remoteUrl}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, remoteUrl: e.target.value })}
                  placeholder="例如：https://github.com/yourname/yourname.github.io.git"
                  className="w-full px-3 py-2 text-sm border border-notion-border rounded-md focus:outline-none focus:border-notion-accent"
                />
                <p className="text-xs text-notion-text-secondary mt-2">保存后会更新当前博客仓库的 `origin` 地址，后续“同步到 GitHub”会推送到这里。</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs text-notion-text-secondary">
                <div className="p-3 rounded-lg bg-notion-bg-hover">
                  <div className="uppercase tracking-wide mb-1">远端名</div>
                  <div className="text-sm text-notion-text">{settingsDraft.remoteName}</div>
                </div>
                <div className="p-3 rounded-lg bg-notion-bg-hover">
                  <div className="uppercase tracking-wide mb-1">当前分支</div>
                  <div className="text-sm text-notion-text">{settingsDraft.branch}</div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-notion-border flex items-center justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm text-notion-text-secondary hover:text-notion-text hover:bg-notion-bg-hover rounded-md transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-2 text-sm bg-notion-text text-white rounded-md hover:bg-neutral-700 disabled:opacity-50 transition-colors"
              >
                {savingSettings ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post list */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20 text-notion-text-placeholder">加载中...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-12 h-12 mx-auto text-notion-text-placeholder mb-4" />
            <p className="text-notion-text-secondary mb-4">还没有文章</p>
            <button
              onClick={() => navigate('/new')}
              className="px-4 py-2 bg-notion-accent text-white rounded-md hover:bg-notion-accent-hover transition-colors text-sm"
            >
              写第一篇文章
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {posts.map((post) => (
              <div
                key={post.slug}
                className="group flex items-center justify-between py-3 px-3 -mx-3 rounded-md hover:bg-notion-bg-hover transition-colors cursor-pointer"
                onClick={() => navigate(`/edit/${post.slug}`)}
              >
                <div className="flex-1 min-w-0">
                  <h2 className="text-[15px] font-medium text-notion-text truncate">
                    {post.title}
                  </h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-notion-text-secondary">
                      <Clock className="w-3 h-3" />
                      {post.pubDate}
                    </span>
                    {post.tags.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-notion-text-secondary">
                        <Tag className="w-3 h-3" />
                        {post.tags.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/edit/${post.slug}`); }}
                    className="p-1.5 rounded hover:bg-notion-border transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-notion-text-secondary" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(post.slug, post.title); }}
                    className="p-1.5 rounded hover:bg-red-50 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
