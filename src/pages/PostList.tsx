import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchPosts,
  deletePost,
  publishPost,
  withdrawPost,
  fetchDrafts,
  restoreDraft,
  deleteDraft,
  syncToGitHub,
  getGitStatus,
  getSettings,
  updateSettings,
  chooseBlogRoot,
  type PostMeta,
  type DraftMeta,
  type GitStatus,
  type BlogSettings,
} from '../lib/api';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Trash2, Edit3, GitBranch, Upload, FileText, Tag, Clock, Settings, FolderOpen, X, FolderTree, Send, Undo2, RotateCcw, Archive } from 'lucide-react';

export default function PostList() {
  const [posts, setPosts] = useState<PostMeta[]>([]);
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [settings, setSettings] = useState<BlogSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<BlogSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const groupedPosts = posts.reduce<Record<string, PostMeta[]>>((acc, post) => {
    const key = (post.category || '未分类').trim() || '未分类';
    if (!acc[key]) acc[key] = [];
    acc[key].push(post);
    return acc;
  }, {});
  const categoryEntries = Object.entries(groupedPosts).sort((a, b) => {
    if (a[0] === '未分类') return 1;
    if (b[0] === '未分类') return -1;
    return a[0].localeCompare(b[0], 'zh-CN');
  });

  const load = async () => {
    setLoading(true);
    try {
      // Load posts independently so a git/status failure never hides the article list.
      const postsPromise = fetchPosts()
        .then((p) => {
          setPosts(p);
          return p;
        })
        .catch((err) => {
          console.error('Failed to load posts:', err);
        });

      const gitPromise = getGitStatus()
        .then((g) => {
          setGitStatus(g);
          return g;
        })
        .catch((err) => {
          console.error('Failed to load git status:', err);
        });

      const draftsPromise = fetchDrafts()
        .then((d) => setDrafts(d))
        .catch((err) => {
          console.error('Failed to load drafts:', err);
        });

      await Promise.all([postsPromise, gitPromise, draftsPromise]);

      try {
        const s = await getSettings();
        setSettings(s);
        setSettingsDraft(s);
      } catch {
        // Settings are desktop-only.
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = (slug: string, title: string) => {
    setConfirmAction({ kind: 'delete', slug, title });
  };

  const showMsg = (msg: string) => {
    setSyncMsg(msg);
    setTimeout(() => setSyncMsg(''), 4000);
  };

  // 自绘确认弹窗状态：kind 决定文案与执行的动作
  type ConfirmKind = 'withdraw' | 'delete' | 'deleteDraft';
  const [confirmAction, setConfirmAction] = useState<{ kind: ConfirmKind; slug: string; title: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const CONFIRM_COPY: Record<ConfirmKind, { title: string; body: (t: string) => string; confirmLabel: string }> = {
    withdraw: {
      title: '撤回文章',
      body: (t) => `将从 GitHub 仓库移除「${t}」并备份到本地草稿箱。`,
      confirmLabel: '确认撤回',
    },
    delete: {
      title: '删除文章',
      body: (t) => `确定要删除「${t}」吗？只会删除本地文件。`,
      confirmLabel: '确认删除',
    },
    deleteDraft: {
      title: '删除草稿',
      body: (t) => `确定删除草稿「${t}」吗？只会删除本地草稿箱备份，不可恢复。`,
      confirmLabel: '确认删除',
    },
  };

  const handleConfirmAction = async () => {
    if (!confirmAction || confirmBusy) return;
    setConfirmBusy(true);
    const { kind, slug } = confirmAction;
    try {
      if (kind === 'withdraw') {
        const result = await withdrawPost(slug);
        showMsg(result.message);
      } else if (kind === 'delete') {
        await deletePost(slug);
        showMsg('文章已删除');
      } else {
        await deleteDraft(slug);
        showMsg('草稿已删除');
      }
      setConfirmAction(null);
      await load();
    } catch (err: any) {
      const label = kind === 'withdraw' ? '撤回失败' : kind === 'delete' ? '删除失败' : '删除草稿失败';
      showMsg(label + ': ' + (err.message || String(err)));
      setConfirmAction(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const handlePublish = async (slug: string) => {
    setRowBusy(slug);
    try {
      const result = await publishPost(slug);
      showMsg(result.message);
      await load();
    } catch (err: any) {
      showMsg('发布失败: ' + (err.message || String(err)));
    } finally {
      setRowBusy(null);
    }
  };

  const handleWithdraw = (slug: string, title: string) => {
    setConfirmAction({ kind: 'withdraw', slug, title });
  };

  const handleRestoreDraft = async (slug: string, title: string) => {
    setRowBusy(slug);
    try {
      const result = await restoreDraft(slug);
      showMsg(result.message);
      await load();
    } catch (err: any) {
      showMsg('重新发布失败: ' + (err.message || String(err)));
    } finally {
      setRowBusy(null);
    }
  };

  const handleDeleteDraft = (slug: string, title: string) => {
    setConfirmAction({ kind: 'deleteDraft', slug, title });
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
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-hairline sticky top-[39px] bg-paper/80 backdrop-blur-sm z-10">
        <div className="max-w-5xl mx-auto px-8 py-3 flex items-center gap-5">
          <div className="flex items-baseline gap-3 shrink-0">
            <FileText className="w-4 h-4 text-ink self-center" />
            <span className="hidden md:inline text-[10px] tracking-[0.22em] uppercase text-ink-3 font-mono">Blog Editor</span>
          </div>
          <div className="w-px h-6 bg-hairline shrink-0" />
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            {settings && (
              <div className="hidden xl:flex items-center gap-3 text-xs text-ink-2 mr-2 max-w-[420px] font-mono">
                <span className="truncate" title={settings.blogRoot}>目录: {settings.blogRoot}</span>
                {settings.remoteUrl && (
                  <span className="truncate" title={settings.remoteUrl}>仓库: {settings.remoteUrl}</span>
                )}
              </div>
            )}
            {/* Git status */}
            {gitStatus && (
              <div className="flex items-center gap-1.5 text-xs text-ink-2 mr-2 font-mono">
                <GitBranch className="w-3.5 h-3.5 text-ink-3" />
                <span>{gitStatus.branch}</span>
                {gitStatus.hasChanges && (
                  <span className="ml-1 px-2 py-0.5 bg-paper-deep text-notion-accent-hover border border-hairline rounded-sm text-[10px] font-sans tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-notion-accent animate-pulse" />
                    有未同步更改
                  </span>
                )}
              </div>
            )}
            <button
              onClick={openSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-hairline text-ink-2 rounded-sm hover:border-ink-3 hover:text-ink hover:bg-white/50 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              设置
            </button>
            <button
              onClick={handleSync}
              disabled={syncing || !gitStatus?.hasChanges}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-hairline text-ink-2 rounded-sm hover:border-ink-3 hover:text-ink hover:bg-white/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {syncing ? '同步中...' : '同步到 GitHub'}
            </button>
            <button
              onClick={() => navigate('/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-ink text-paper border border-ink rounded-sm hover:bg-neutral-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              新文章
            </button>
          </div>
        </div>
      </header>

      {/* Sync message toast */}
      {syncMsg && (
        <div className="fixed top-4 right-4 z-50 max-w-sm px-4 py-2 bg-ink text-paper text-sm rounded-sm shadow-lg animate-fade-in break-words">
          {syncMsg}
        </div>
      )}

      {showSettings && settingsDraft && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
        >
          <div className="w-full max-w-2xl bg-paper rounded-md shadow-2xl border border-hairline">
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="text-lg font-medium tracking-wider text-ink">博客设置</h2>
                <p className="text-sm text-ink-2 mt-1">在这里选择本地博客目录，并修改推送使用的 GitHub 仓库地址。</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-sm hover:bg-paper-deep transition-colors"
              >
                <X className="w-4 h-4 text-ink-2" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">本地博客目录</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settingsDraft.blogRoot}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, blogRoot: e.target.value })}
                    placeholder="例如：D:\\bigproject\\blog"
                    className="flex-1 px-3 py-2 text-sm bg-white/60 border border-hairline rounded-sm focus:outline-none focus:border-notion-accent"
                  />
                  <button
                    onClick={handlePickBlogRoot}
                    className="px-3 py-2 text-sm border border-hairline text-ink-2 rounded-sm hover:border-ink-3 hover:text-ink hover:bg-white/50 transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-4 h-4" />
                    选择目录
                  </button>
                </div>
                <p className="text-xs text-ink-2 mt-2">应选择博客项目根目录，也就是里面包含 `src/content/blog` 和 `public/uploads` 的目录。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">GitHub 仓库地址</label>
                <input
                  type="text"
                  value={settingsDraft.remoteUrl}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, remoteUrl: e.target.value })}
                  placeholder="例如：https://github.com/yourname/yourname.github.io.git"
                  className="w-full px-3 py-2 text-sm bg-white/60 border border-hairline rounded-sm focus:outline-none focus:border-notion-accent"
                />
                <p className="text-xs text-ink-2 mt-2">保存后会更新当前博客仓库的 `origin` 地址，后续“同步到 GitHub”会推送到这里。</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs text-ink-2">
                <div className="p-3 rounded-sm bg-paper-deep border border-hairline">
                  <div className="uppercase tracking-wide mb-1">远端名</div>
                  <div className="text-sm text-ink font-mono">{settingsDraft.remoteName}</div>
                </div>
                <div className="p-3 rounded-sm bg-paper-deep border border-hairline">
                  <div className="uppercase tracking-wide mb-1">当前分支</div>
                  <div className="text-sm text-ink font-mono">{settingsDraft.branch}</div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-hairline flex items-center justify-end gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm text-ink-2 hover:text-ink hover:bg-paper-deep rounded-sm transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="px-4 py-2 text-sm bg-ink text-paper rounded-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors"
              >
                {savingSettings ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 通用确认弹窗（撤回/删除文章/删除草稿共用） */}
      {confirmAction && (
        <ConfirmDialog
          open
          title={CONFIRM_COPY[confirmAction.kind].title}
          body={CONFIRM_COPY[confirmAction.kind].body(confirmAction.title)}
          confirmLabel={CONFIRM_COPY[confirmAction.kind].confirmLabel}
          danger
          busy={confirmBusy}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Post list */}
      <main className="max-w-4xl mx-auto px-8 pt-11 pb-20">
        {loading ? (
          <div className="text-center py-20 text-ink-3">加载中...</div>
        ) : posts.length === 0 && drafts.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-12 h-12 mx-auto text-ink-3 mb-4" />
            <p className="text-ink-2 mb-4">还没有文章</p>
            <button
              onClick={() => navigate('/new')}
              className="px-4 py-2 bg-ink text-paper rounded-sm hover:bg-neutral-800 transition-colors text-sm"
            >
              写第一篇文章
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-10">
              <h2 className="text-2xl font-medium tracking-widest text-ink">文稿</h2>
              <span className="font-mono text-xs text-ink-3 tracking-wider">
                {posts.length} 篇 · {categoryEntries.length} 个分类
              </span>
            </div>
            <div>
              {/* 草稿箱分组：置顶展示撤回到本地的文章备份 */}
              {drafts.length > 0 && (
                <section className="mb-12">
                  <div className="flex items-baseline gap-3 pb-2.5 mb-1 border-b-2 border-seal">
                    <Archive className="w-4 h-4 text-seal self-center" />
                    <h2 className="text-base font-medium tracking-[0.14em] text-seal">草稿箱</h2>
                    <span className="font-mono text-[11px] text-ink-3">{drafts.length} 篇 · 仅保存在本地</span>
                  </div>

                  <div>
                    {drafts.map((draft) => (
                      <div
                        key={draft.slug}
                        className="group relative grid grid-cols-[96px_1fr_auto] items-baseline gap-5 px-2.5 py-3 border-b border-hairline hover:bg-white/60 transition-colors"
                      >
                        <span className="flex items-center gap-1 font-mono text-[11.5px] text-ink-3 tracking-wide">
                          <Clock className="w-3 h-3" />
                          {draft.pubDate}
                        </span>
                        <h3 className="text-[15px] text-ink-2 truncate">
                          {draft.title}
                        </h3>
                        <span className="font-mono text-[11px] text-ink-3 truncate">{draft.slug}.md</span>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-3 bg-paper opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleRestoreDraft(draft.slug, draft.title)}
                            disabled={rowBusy === draft.slug}
                            className="flex items-center gap-1 px-2 py-1 text-xs tracking-wider text-ink-2 border border-transparent rounded-sm hover:border-hairline hover:text-ink hover:bg-white transition-colors disabled:opacity-40"
                            title="复制回博客目录并发布"
                          >
                            <RotateCcw className="w-3 h-3" />
                            重新发布
                          </button>
                          <button
                            onClick={() => handleDeleteDraft(draft.slug, draft.title)}
                            className="flex items-center gap-1 px-2 py-1 text-xs tracking-wider text-ink-2 border border-transparent rounded-sm hover:border-seal/30 hover:text-seal hover:bg-white transition-colors"
                            title="只删除本地备份"
                          >
                            <Trash2 className="w-3 h-3" />
                            删除草稿
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {categoryEntries.map(([categoryName, categoryPosts]) => (
                <section key={categoryName} className="mb-12">
                  <div className="flex items-center gap-3 pb-2.5 mb-1 border-b-2 border-ink">
                    <FolderTree className="w-4 h-4 text-ink-2 self-center" />
                    <h2 className="text-base font-medium tracking-[0.14em] text-ink">{categoryName}</h2>
                    <span className="font-mono text-[11px] text-ink-3">{categoryPosts.length} 篇</span>
                    <button
                      type="button"
                      onClick={() => navigate(`/new?category=${encodeURIComponent(categoryName)}`)}
                      className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-2 border border-hairline rounded-sm hover:border-ink-3 hover:text-ink hover:bg-white/60 transition-colors"
                      title={`在「${categoryName}」中新建文章`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      新建文章
                    </button>
                  </div>

                  <div>
                    {categoryPosts.map((post) => (
                      <div
                        key={post.slug}
                        className="group relative grid grid-cols-[96px_1fr_auto] items-baseline gap-5 px-2.5 py-3 border-b border-hairline cursor-pointer hover:bg-white/60 transition-colors"
                        onClick={() => navigate(`/edit/${post.slug}`)}
                      >
                        <span className="flex items-center gap-1 font-mono text-[11.5px] text-ink-3 tracking-wide">
                          <Clock className="w-3 h-3" />
                          {post.pubDate}
                        </span>
                        <h3 className="text-[15px] text-ink truncate transition-colors group-hover:text-notion-accent-hover">
                          {post.title}
                        </h3>
                        <span className="flex items-baseline gap-2.5 text-xs text-ink-3">
                          <span className="text-[11px] tracking-widest text-ink-2 border border-hairline px-2 py-0.5 rounded-sm bg-white/40">
                            {post.category || '未分类'}
                          </span>
                          {post.tags.length > 0 && (
                            <span className="hidden md:flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {post.tags.join(', ')}
                            </span>
                          )}
                        </span>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pl-3 bg-paper opacity-0 group-hover:opacity-100 transition-opacity">
                          {post.published ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleWithdraw(post.slug, post.title); }}
                              className="flex items-center gap-1 px-2 py-1 text-xs tracking-wider text-ink-2 border border-transparent rounded-sm hover:border-seal/30 hover:text-seal hover:bg-white transition-colors"
                              title="撤回发布（从仓库移除并备份到草稿箱）"
                            >
                              <Undo2 className="w-3 h-3" />
                              撤回
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handlePublish(post.slug); }}
                              disabled={rowBusy === post.slug}
                              className="flex items-center gap-1 px-2 py-1 text-xs tracking-wider text-ink-2 border border-transparent rounded-sm hover:border-hairline hover:text-ink hover:bg-white transition-colors disabled:opacity-40"
                              title="发布（仅提交此文章及其图片）"
                            >
                              <Send className="w-3 h-3" />
                              发布
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/edit/${post.slug}`); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs tracking-wider text-ink-2 border border-transparent rounded-sm hover:border-hairline hover:text-ink hover:bg-white transition-colors"
                            title="编辑"
                          >
                            <Edit3 className="w-3 h-3" />
                            编辑
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(post.slug, post.title); }}
                            className="flex items-center gap-1 px-2 py-1 text-xs tracking-wider text-ink-2 border border-transparent rounded-sm hover:border-seal/30 hover:text-seal hover:bg-white transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3 h-3" />
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {/* 右下角朱色闲章：静态装饰，不遮挡内容 */}
            <div className="flex justify-end mt-4 pr-1">
              <div
                className="h-9 px-2.5 bg-seal text-paper flex items-center justify-center text-[11px] tracking-[0.12em] leading-tight rounded-sm opacity-80 select-none"
              >
                Aerchen
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
