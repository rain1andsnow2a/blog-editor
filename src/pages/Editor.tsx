// 编辑器页面：只负责状态编排与页面组装。
// - Markdown 转换 → lib/markdown.ts
// - 斜杠菜单逻辑 → hooks/useSlashMenu.ts（条目定义在 lib/slashItems.tsx）
// - 自动保存 → hooks/useAutoSave.ts
// - 气泡菜单 / 工具栏 / 元信息面板 / 弹窗 → components/editor/*
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ImageExt from '@tiptap/extension-image';
import LinkExt from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import { common, createLowlight } from 'lowlight';
import { ArrowLeft, Save } from 'lucide-react';
import { MathBlock, MathInline } from '../extensions/MathBlock';
import { CodeBlockWithMermaid } from '../extensions/CodeBlockWithMermaid';
import { SmartArrows } from '../extensions/SmartArrows';
import { fetchPost, createPost, updatePost, uploadImage } from '../lib/api';
import {
  markdownToHtml, editorJsonToMarkdown, looksLikeMarkdown, normalizeMathFormula,
} from '../lib/markdown';
import { buildSlashItems, buildYijingGroups } from '../lib/slashItems';
import { useSlashMenu } from '../hooks/useSlashMenu';
import { useAutoSave } from '../hooks/useAutoSave';
import { OutlinePanel } from '../components/editor/SidePanels';
import { SelectionBubbleMenu, CodeBlockBubbleMenu } from '../components/editor/EditorBubbleMenus';
import { FrontmatterPanel } from '../components/editor/FrontmatterPanel';
import { EditorToolbar } from '../components/editor/EditorToolbar';
import { SlashMenuPopup } from '../components/editor/SlashMenuPopup';
import { MathDialog } from '../components/editor/MathDialog';

const lowlight = createLowlight(common);

export default function Editor() {
  const { slug } = useParams<{ slug: string }>();
  const isNew = !slug;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('category')?.trim() || '未分类';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cover, setCover] = useState('');
  const [pubDate, setPubDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(initialCategory);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [loadError, setLoadError] = useState('');

  // Math formula dialog state
  const [mathDialog, setMathDialog] = useState<{ type: 'block' | 'inline' } | null>(null);
  const [mathFormula, setMathFormula] = useState('');

  const notify = useCallback((msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(''), 3000);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: '开始写作...' }),
      ImageExt.configure({ allowBase64: true, inline: false }),
      LinkExt.configure({ openOnClick: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockWithMermaid.configure({ lowlight }),
      MathBlock,
      MathInline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      SmartArrows,
    ],
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
        spellcheck: 'false',
      },
      handleKeyDown: (_view, event) => slashMenu.handleKeyDown(event),
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) handleImageUpload(file);
            return true;
          }
        }

        // Convert pasted Markdown source (tables, headings, lists...) into editor nodes,
        // like Notion does. Skipped inside code blocks so raw text can be pasted there.
        const text = event.clipboardData?.getData('text/plain');
        if (text && looksLikeMarkdown(text)) {
          if (view.state.selection.$from.parent.type.name === 'codeBlock') return false;
          event.preventDefault();
          editor?.commands.insertContent(markdownToHtml(text));
          return true;
        }

        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  const insertSymbol = useCallback((symbol: string) => {
    editor?.chain().focus().insertContent(symbol).run();
  }, [editor]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return;
    try {
      const { url } = await uploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error('Image upload failed:', err);
    }
  }, [editor]);

  const pickImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) handleImageUpload(file);
    };
    input.click();
  }, [handleImageUpload]);

  const openMathDialog = useCallback((type: 'block' | 'inline') => {
    setMathDialog({ type });
    setMathFormula('');
  }, []);

  // --- Slash menu ---
  const yijingGroups = buildYijingGroups(insertSymbol);
  const slashItems = buildSlashItems({
    editor,
    openMathDialog,
    pickImage,
    yijingItems: yijingGroups.flatMap((group) => group.items),
  });
  const slashMenu = useSlashMenu({ editor, items: slashItems, yijingGroups });

  // --- Auto save ---
  const buildFrontmatter = () => ({
    title, description, cover, pubDate,
    category: category.trim() || '未分类',
    tags,
    updatedDate: new Date().toISOString().split('T')[0],
  });

  const autoSave = useAutoSave({
    enabled: !isNew && !!slug,
    editor,
    buildPayload: () => {
      if (!editor || !title.trim()) return null;
      const content = editorJsonToMarkdown(editor.getJSON());
      return {
        snapshot: JSON.stringify({ title, description, cover, pubDate, category, tags, content }),
        frontmatter: buildFrontmatter(),
        content,
      };
    },
    save: async ({ frontmatter, content }) => {
      await updatePost(slug!, { frontmatter, content });
    },
  });

  // Watch metadata changes (title, description, cover, pubDate, category, tags)
  const metaVersion = useRef(0);
  useEffect(() => {
    // Skip the first render (initial load)
    metaVersion.current += 1;
    if (metaVersion.current <= 1) return;
    autoSave.schedule();
  }, [title, description, cover, pubDate, category, tags]);

  // Load existing post
  useEffect(() => {
    if (slug && editor) {
      setLoadError('');
      fetchPost(slug)
        .then((post) => {
          setTitle(post.frontmatter.title);
          setDescription(post.frontmatter.description);
          setCover(post.frontmatter.cover || '');
          setPubDate(post.frontmatter.pubDate);
          setCategory(post.frontmatter.category || '未分类');
          setTags(post.frontmatter.tags);
          try {
            const html = markdownToHtml(post.content);
            editor.commands.setContent(html);
          } catch (renderErr: any) {
            console.error('Failed to render post content:', renderErr);
            setLoadError('文章内容渲染失败: ' + (renderErr?.message || String(renderErr)));
            // Fallback: try loading as plain paragraph
            try {
              editor.commands.setContent(`<p>${post.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`);
            } catch {
              // Last resort: empty editor
              editor.commands.setContent('<p></p>');
            }
          }
          // Initialize saved snapshot after loading to prevent immediate auto-save
          setTimeout(() => {
            const content = editorJsonToMarkdown(editor.getJSON());
            autoSave.markSaved(JSON.stringify({
              title: post.frontmatter.title,
              description: post.frontmatter.description,
              cover: post.frontmatter.cover || '',
              pubDate: post.frontmatter.pubDate,
              category: post.frontmatter.category || '未分类',
              tags: post.frontmatter.tags,
              content,
            }));
            metaVersion.current = 0; // Reset so next meta change triggers save
          }, 100);
        })
        .catch((err: any) => {
          console.error('Failed to load post:', err);
          setLoadError(err?.message || '加载文章失败');
        });
    }
  }, [slug, editor]);

  const handleSave = async () => {
    if (!title.trim()) {
      notify('请输入标题');
      return;
    }

    setSaving(true);
    setSaveMsg('');
    // Cancel pending auto-save since we're saving now
    autoSave.cancelPending();
    try {
      const content = editor ? editorJsonToMarkdown(editor.getJSON()) : '';
      const frontmatter = {
        ...buildFrontmatter(),
        updatedDate: isNew ? null : new Date().toISOString().split('T')[0],
      };

      if (isNew) {
        const s = newSlug.trim() || title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
        await createPost({ slug: s, frontmatter, content });
        setSaveMsg('创建成功！');
        setTimeout(() => navigate(`/edit/${s}`), 1000);
      } else {
        await updatePost(slug!, { frontmatter, content });
        // Update auto-save snapshot to avoid redundant saves
        autoSave.markSaved(JSON.stringify({ title, description, cover, pubDate, category, tags, content }));
        setSaveMsg('保存成功！');
      }
    } catch (err: any) {
      setSaveMsg('保存失败: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  // Keyboard shortcut: Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [title, description, pubDate, category, tags, editor, slug, newSlug]);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  // Insert math formula from dialog
  const handleMathInsert = () => {
    if (!editor || !mathDialog || !mathFormula.trim()) {
      setMathDialog(null);
      return;
    }
    const formula = normalizeMathFormula(mathFormula, mathDialog.type);
    if (!formula) {
      setMathDialog(null);
      setMathFormula('');
      return;
    }
    if (mathDialog.type === 'block') {
      (editor.commands as any).insertMathBlock({ formula });
    } else {
      (editor.commands as any).insertMathInline({ formula });
    }
    setMathDialog(null);
    setMathFormula('');
    editor.commands.focus();
  };

  if (!editor) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-6 h-6 border-2 border-hairline border-t-notion-accent rounded-full mx-auto mb-3" />
          <p className="text-sm text-ink-2">编辑器加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-deep">
      {/* Top bar — 和纸稿纸：面包屑 + 自动保存徽章 + 墨色保存按钮 */}
      <header className="border-b border-hairline sticky top-[39px] bg-paper/85 backdrop-blur-md z-30 h-[52px]">
        <div className="max-w-[1120px] mx-auto px-5 h-full flex items-center gap-3.5">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-[13px] text-notion-text-secondary hover:text-notion-text transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            文章列表
          </button>
          <span className="text-[13px] text-notion-text-placeholder truncate">
            {category || '未分类'} / <b className="text-notion-text font-semibold">{title || '无标题'}</b>
          </span>
          <div className="flex-1" />
          {saveMsg && (
            <span className="text-xs text-notion-text-secondary">{saveMsg}</span>
          )}
          {!saveMsg && autoSave.status === 'editing' && (
            <span className="text-xs text-notion-text-secondary opacity-60">编辑中...</span>
          )}
          {!saveMsg && autoSave.status === 'saving' && (
            <span className="text-xs px-2.5 py-0.5 rounded-sm bg-paper-deep text-notion-accent-hover border border-hairline font-medium">保存中...</span>
          )}
          {!saveMsg && autoSave.status === 'saved' && (
            <span className="text-xs px-2.5 py-0.5 rounded-sm bg-paper-deep text-notion-accent-hover border border-hairline font-medium">已自动保存 ✓</span>
          )}
          {!saveMsg && autoSave.status === 'error' && (
            <span className="text-xs px-2.5 py-0.5 rounded-sm bg-paper-deep text-seal border border-seal/30 font-medium">自动保存失败</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium text-paper rounded-sm disabled:opacity-50 transition-colors bg-ink hover:bg-neutral-800"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : isNew ? '创建' : '保存'}
          </button>
        </div>
      </header>

      <SelectionBubbleMenu editor={editor} />
      <CodeBlockBubbleMenu editor={editor} />

      {/* 双栏布局：大纲 | 正文（右侧插入块面板已移除，插入能力由工具栏/斜杠菜单承担） */}
      <div className="max-w-[1120px] mx-auto flex items-start">
        <OutlinePanel editor={editor} />

        {/* Main editor area */}
        <main className="flex-1 min-w-0 bg-paper xl:border-x border-hairline min-h-[calc(100vh-52px)] px-6 md:px-14 py-11">
          <FrontmatterPanel
            isNew={isNew}
            newSlug={newSlug}
            onNewSlugChange={setNewSlug}
            title={title}
            onTitleChange={setTitle}
            description={description}
            onDescriptionChange={setDescription}
            cover={cover}
            onCoverChange={setCover}
            onNotify={notify}
            pubDate={pubDate}
            onPubDateChange={setPubDate}
            category={category}
            onCategoryChange={setCategory}
            tags={tags}
            tagInput={tagInput}
            onTagInputChange={setTagInput}
            onAddTag={addTag}
            onRemoveTag={removeTag}
          />

          <EditorToolbar editor={editor} onPickImage={pickImage} onOpenMath={openMathDialog} />

          {loadError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {/* Editor content (relative for slash menu positioning) */}
          <div className="relative">
            <EditorContent editor={editor} className="min-h-[50vh]" />

            {slashMenu.slashOpen && slashMenu.filteredItems.length > 0 && slashMenu.slashPos.current && (
              <SlashMenuPopup
                pos={slashMenu.slashPos.current}
                items={slashMenu.filteredItems}
                activeIndex={slashMenu.slashIndex}
                submenuId={slashMenu.slashSubmenuId}
                showYijingPanel={slashMenu.showYijingPanel}
                yijingGroups={slashMenu.visibleYijingGroups}
                onExecute={slashMenu.executeSlashCommand}
                onHoverItem={(idx, item) => {
                  slashMenu.setSlashIndex(idx);
                  slashMenu.setSlashSubmenuId(item.children?.length ? item.id : null);
                }}
              />
            )}
          </div>

          {mathDialog && (
            <MathDialog
              type={mathDialog.type}
              formula={mathFormula}
              onFormulaChange={setMathFormula}
              onSubmit={handleMathInsert}
              onClose={() => setMathDialog(null)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
