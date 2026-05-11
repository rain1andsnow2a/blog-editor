import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent, BubbleMenu, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
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
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { MathBlock, MathInline } from '../extensions/MathBlock';
import {
  ArrowLeft, Save, Bold, Italic, Underline as UnderlineIcon,
  Strikethrough, Code, Link2, List, ListOrdered, Quote,
  Heading1, Heading2, Heading3, Minus, Type, Palette, Highlighter,
  Image as ImageIcon, CheckSquare, Table as TableIcon, Upload,
  X, Tag, Calendar, ChevronDown, ChevronRight, Pilcrow, TextQuote, ListTodo,
  FileCode2, Sigma, Copy,
} from 'lucide-react';
import TurndownService from 'turndown';
import { fetchPost, createPost, updatePost, uploadImage } from '../lib/api';

const lowlight = createLowlight(common);

let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null;

function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => {
      module.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
      });
      return module.default;
    });
  }

  return mermaidPromise;
}

function MermaidPreview({ code }: { code: string }) {
  const idRef = useRef(`mermaid-preview-${Math.random().toString(36).slice(2)}`);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const source = code.trim();

    if (!source) {
      setSvg('');
      setError('');
      return;
    }

    getMermaid()
      .then((mermaid) => mermaid.render(idRef.current, source))
      .then(({ svg }) => {
        if (cancelled) return;
        setSvg(svg);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setSvg('');
        setError(err?.message || 'Mermaid 渲染失败');
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="mermaid-preview" contentEditable={false}>
      <div className="mermaid-preview__label">Mermaid 预览</div>
      {error ? (
        <pre className="mermaid-preview__error">{error}</pre>
      ) : svg ? (
        <div className="mermaid-preview__canvas" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="mermaid-preview__empty">输入 Mermaid 代码后会在这里显示图形</div>
      )}
    </div>
  );
}

function CodeBlockWithMermaidPreview({ node }: { node: any }) {
  const language = node.attrs?.language || '';
  const isMermaid = language.toLowerCase() === 'mermaid';

  return (
    <NodeViewWrapper className={isMermaid ? 'mermaid-code-block' : 'code-block'}>
      <pre>
        <NodeViewContent as="code" className={language ? `language-${language}` : ''} />
      </pre>
      {isMermaid && <MermaidPreview code={node.textContent || ''} />}
    </NodeViewWrapper>
  );
}

const CodeBlockWithMermaid = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockWithMermaidPreview);
  },
});

// --- Turndown (HTML → Markdown) ---
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  hr: '---',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// Strikethrough support
turndown.addRule('strikethrough', {
  filter: ['s', 'del', 'strike'],
  replacement: (content) => `~~${content}~~`,
});

// Remove color spans/marks but keep content
turndown.addRule('colorSpan', {
  filter: (node) => node.nodeName === 'SPAN' || node.nodeName === 'MARK',
  replacement: (content) => content,
});

// Task list support
turndown.addRule('taskListItem', {
  filter: (node) => {
    return node.nodeName === 'LI' && node.parentElement?.getAttribute('data-type') === 'taskList';
  },
  replacement: (content, node) => {
    const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]');
    const checked = checkbox ? (checkbox as HTMLInputElement).checked : false;
    return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`;
  },
});

// Math block → $$...$$
turndown.addRule('mathBlock', {
  filter: (node) => node.nodeName === 'DIV' && node.getAttribute('data-type') === 'math-block',
  replacement: (_content, node) => {
    const formula = (node as HTMLElement).getAttribute('formula') || '';
    return `\n$$\n${formula}\n$$\n`;
  },
});

// Math inline → $...$
turndown.addRule('mathInline', {
  filter: (node) => node.nodeName === 'SPAN' && node.getAttribute('data-type') === 'math-inline',
  replacement: (_content, node) => {
    const formula = (node as HTMLElement).getAttribute('formula') || '';
    return `$${formula}$`;
  },
});

const TEXT_COLORS = [
  { name: '默认', color: '#37352f' },
  { name: '灰色', color: '#787774' },
  { name: '棕色', color: '#9f6b53' },
  { name: '橙色', color: '#d9730d' },
  { name: '黄色', color: '#cb912f' },
  { name: '绿色', color: '#448361' },
  { name: '蓝色', color: '#337ea9' },
  { name: '紫色', color: '#9065b0' },
  { name: '粉色', color: '#c14c8a' },
  { name: '红色', color: '#d44c47' },
];

const BG_COLORS = [
  { name: '默认', color: 'transparent' },
  { name: '灰色', color: '#f1f1ef' },
  { name: '棕色', color: '#f4eeee' },
  { name: '橙色', color: '#fbecdd' },
  { name: '黄色', color: '#fbf3db' },
  { name: '绿色', color: '#edf3ec' },
  { name: '蓝色', color: '#e7f3f8' },
  { name: '紫色', color: '#f6f3f9' },
  { name: '粉色', color: '#faf1f5' },
  { name: '红色', color: '#fdebec' },
];

const CODE_LANGUAGES = [
  { label: 'Plain Text', value: '' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'PowerShell', value: 'powershell' },
  { label: 'Bash', value: 'bash' },
  { label: 'JSON', value: 'json' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'Mermaid 图表', value: 'mermaid' },
];

function stripWrappedFormula(value: string, open: string, close: string) {
  let next = value.trim();
  while (next.startsWith(open) && next.endsWith(close) && next.length >= open.length + close.length) {
    next = next.slice(open.length, next.length - close.length).trim();
  }
  return next;
}

function normalizeMathFormula(value: string, type: 'block' | 'inline') {
  let formula = value.replace(/\u200B/g, '').trim();
  const pairs: Array<[string, string]> = type === 'block'
    ? [['$$', '$$'], ['\\[', '\\]'], ['$', '$'], ['\\(', '\\)']]
    : [['$$', '$$'], ['$', '$'], ['\\(', '\\)'], ['\\[', '\\]']];

  for (const [open, close] of pairs) {
    formula = stripWrappedFormula(formula, open, close);
  }

  return formula;
}

const EMPTY_PARAGRAPH_MARKDOWN = '<p>&nbsp;</p>';
const EMPTY_PARAGRAPH_HTML_RE = /^<p>(?:&nbsp;|\s|<br\s*\/?>)*<\/p>$/i;

type SlashItem = {
  id: string;
  label: string;
  desc: string;
  shortcut?: string;
  icon: React.ReactNode;
  action?: () => void;
  children?: SlashItem[];
};

type YijingGroup = {
  id: string;
  title: string;
  items: SlashItem[];
};

export default function Editor() {
  const { slug } = useParams<{ slug: string }>();
  const isNew = !slug;
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pubDate, setPubDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('未分类');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTurnInto, setShowTurnInto] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Slash command menu state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashSubmenuId, setSlashSubmenuId] = useState<string | null>(null);
  const slashPos = useRef<{ top: number; left: number } | null>(null);
  const slashFromPos = useRef<number>(0);

  // Math formula dialog state
  const [mathDialog, setMathDialog] = useState<{ type: 'block' | 'inline' } | null>(null);
  const [mathFormula, setMathFormula] = useState('');
  const mathInputRef = useRef<HTMLTextAreaElement>(null);

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
    ],
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
      },
      handleKeyDown: (_view, event) => {
        // Open slash menu on '/'
        if (event.key === '/' && !slashOpen && !event.ctrlKey && !event.metaKey) {
          // Defer so the '/' character is inserted first
          setTimeout(() => {
            if (!editor) return;
            const { from } = editor.state.selection;
            // Get cursor position for popup
            const coords = editor.view.coordsAtPos(from);
            const editorRect = editor.view.dom.getBoundingClientRect();
            slashPos.current = {
              top: coords.bottom - editorRect.top + 4,
              left: coords.left - editorRect.left,
            };
            slashFromPos.current = from - 1; // position of the '/'
            setSlashFilter('');
            setSlashIndex(0);
            setSlashSubmenuId(null);
            setSlashOpen(true);
          }, 0);
          return false;
        }

        // Handle keys when slash menu is open
        if (slashOpen) {
          if (event.key === 'Escape') {
            setSlashOpen(false);
            setSlashSubmenuId(null);
            return true;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSlashIndex(i => i + 1);
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSlashIndex(i => Math.max(0, i - 1));
            return true;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            // Will be handled by the executeSlashCommand callback
            document.dispatchEvent(new CustomEvent('slash-execute'));
            return true;
          }
          if (event.key === 'Backspace') {
            // If filter is empty (only '/' left), close the menu
            if (slashFilter === '') {
              setTimeout(() => setSlashOpen(false), 0);
              return false;
            }
            setTimeout(() => {
              if (!editor) return;
              const { from } = editor.state.selection;
              const text = editor.state.doc.textBetween(slashFromPos.current, from);
              if (!text.startsWith('/')) {
                setSlashOpen(false);
                setSlashSubmenuId(null);
              } else {
                setSlashFilter(text.slice(1));
                setSlashIndex(0);
                setSlashSubmenuId(null);
              }
            }, 0);
            return false;
          }
          // Update filter on typing
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            setTimeout(() => {
              if (!editor) return;
              const { from } = editor.state.selection;
              const text = editor.state.doc.textBetween(slashFromPos.current, from);
              if (text.startsWith('/')) {
                setSlashFilter(text.slice(1));
                setSlashIndex(0);
                setSlashSubmenuId(null);
              } else {
                setSlashOpen(false);
                setSlashSubmenuId(null);
              }
            }, 0);
            return false;
          }
        }

        return false;
      },
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

  // Load existing post
  useEffect(() => {
    if (slug && editor) {
      setLoadError('');
      fetchPost(slug)
        .then((post) => {
          setTitle(post.frontmatter.title);
          setDescription(post.frontmatter.description);
          setPubDate(post.frontmatter.pubDate);
          setCategory(post.frontmatter.category || '未分类');
          setTags(post.frontmatter.tags);
          editor.commands.setContent(markdownToHtml(post.content));
        })
        .catch((err: any) => {
          console.error('Failed to load post:', err);
          setLoadError(err?.message || '加载文章失败');
        });
    }
  }, [slug, editor]);

  // Convert markdown to HTML for TipTap (block-aware parser)
  function markdownToHtml(md: string): string {
    const lines = md.split('\n');
    const blocks: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Math block ($$...$$)
      if (line.trim() === '$$') {
        const mathLines: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim() !== '$$') {
          mathLines.push(lines[i]);
          i++;
        }
        i++; // skip closing $$
        const formula = normalizeMathFormula(mathLines.join('\n'), 'block');
        blocks.push(`<div data-type="math-block" formula="${formula.replace(/"/g, '&quot;')}"></div>`);
        continue;
      }

      // Code block (fenced)
      if (line.trimStart().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        const escaped = codeLines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        blocks.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`);
        continue;
      }

      // Heading
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        blocks.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
        i++;
        continue;
      }

      // HR
      if (/^---+$/.test(line.trim())) {
        blocks.push('<hr>');
        i++;
        continue;
      }

      // Blockquote (collect consecutive > lines)
      if (line.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('> ')) {
          quoteLines.push(lines[i].slice(2));
          i++;
        }
        blocks.push(`<blockquote><p>${inlineFormat(quoteLines.join(' '))}</p></blockquote>`);
        continue;
      }

      // Unordered list
      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*]\s+/, ''));
          i++;
        }
        blocks.push('<ul>' + items.map(it => `<li><p>${inlineFormat(it)}</p></li>`).join('') + '</ul>');
        continue;
      }

      // Ordered list
      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s+/, ''));
          i++;
        }
        blocks.push('<ol>' + items.map(it => `<li><p>${inlineFormat(it)}</p></li>`).join('') + '</ol>');
        continue;
      }

      // Empty line — skip
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Explicit blank paragraph marker emitted by this editor.
      if (EMPTY_PARAGRAPH_HTML_RE.test(line.trim())) {
        blocks.push('<p></p>');
        i++;
        continue;
      }

      // Paragraph — collect consecutive non-empty, non-special lines
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        lines[i].trim() !== '$$' &&
        !lines[i].startsWith('#') &&
        !lines[i].startsWith('```') &&
        !lines[i].startsWith('> ') &&
        !/^[-*]\s+/.test(lines[i]) &&
        !/^\d+\.\s+/.test(lines[i]) &&
        !/^---+$/.test(lines[i].trim())
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length > 0) {
        blocks.push(`<p>${inlineFormat(paraLines.join(' '))}</p>`);
      } else {
        // Prevent unsupported block syntax from trapping the parser on the same line.
        blocks.push(`<p>${inlineFormat(line)}</p>`);
        i++;
      }
    }

    return blocks.join('');
  }

  // Inline formatting: bold, italic, code, links, images, strikethrough
  function inlineFormat(text: string): string {
    return text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (_m, f) => {
        const formula = normalizeMathFormula(f, 'inline');
        return `<span data-type="math-inline" formula="${formula.replace(/"/g, '&quot;')}"></span>`;
      })
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<s>$1</s>');
  }

  // Convert editor JSON to markdown directly (bypasses HTML serialization
  // which corrupts atom nodes like math).
  function htmlToMarkdown(): string {
    if (!editor) return '';
    const json = editor.getJSON();
    if (!json.content) return '';

    // Serialize inline content (text, marks, inline nodes) to markdown string
    function inlineToMd(nodes: any[]): string {
      return nodes.map((n: any) => {
        if (n.type === 'mathInline') return `$${normalizeMathFormula(n.attrs?.formula || '', 'inline')}$`;
        if (n.type === 'image') return `![${n.attrs?.alt || ''}](${n.attrs?.src || ''})`;
        if (n.type === 'hardBreak') return '\n';
        if (n.type !== 'text') return '';
        let t: string = n.text || '';
        const marks: any[] = n.marks || [];
        // Apply marks inside-out
        for (const m of marks) {
          if (m.type === 'code') { t = `\`${t}\``; continue; }
          if (m.type === 'bold') t = `**${t}**`;
          if (m.type === 'italic') t = `*${t}*`;
          if (m.type === 'underline') t = `<u>${t}</u>`;
          if (m.type === 'strike') t = `~~${t}~~`;
          if (m.type === 'link') t = `[${t}](${m.attrs?.href || ''})`;
        }
        return t;
      }).join('');
    }

    function blockToMd(node: any): string {
      const children = node.content || [];

      switch (node.type) {
        case 'paragraph':
          return children.length > 0 ? inlineToMd(children) : EMPTY_PARAGRAPH_MARKDOWN;
        case 'heading': {
          const level = node.attrs?.level || 1;
          return '#'.repeat(level) + ' ' + inlineToMd(children);
        }
        case 'mathBlock':
          return `$$\n${normalizeMathFormula(node.attrs?.formula || '', 'block')}\n$$`;
        case 'codeBlock': {
          const lang = node.attrs?.language || '';
          const code = children.map((c: any) => c.text || '').join('');
          return '```' + lang + '\n' + code + '\n```';
        }
        case 'blockquote':
          return children.map((c: any) => blockToMd(c)).map((l: string) =>
            l.split('\n').map((s: string) => `> ${s}`).join('\n')
          ).join('\n');
        case 'bulletList':
          return children.map((li: any) => {
            const inner = (li.content || []).map((c: any) => blockToMd(c)).join('\n');
            return `- ${inner}`;
          }).join('\n');
        case 'orderedList':
          return children.map((li: any, idx: number) => {
            const inner = (li.content || []).map((c: any) => blockToMd(c)).join('\n');
            return `${idx + 1}. ${inner}`;
          }).join('\n');
        case 'taskList':
          return children.map((li: any) => {
            const checked = li.attrs?.checked ? 'x' : ' ';
            const inner = (li.content || []).map((c: any) => blockToMd(c)).join('\n');
            return `- [${checked}] ${inner}`;
          }).join('\n');
        case 'horizontalRule':
          return '---';
        case 'image':
          return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})`;
        case 'table': {
          const rows = children.filter((r: any) => r.type === 'tableRow');
          if (rows.length === 0) return '';
          const toRow = (row: any) =>
            '| ' + (row.content || []).map((cell: any) =>
              (cell.content || []).map((c: any) => blockToMd(c)).join(' ')
            ).join(' | ') + ' |';
          const lines = [toRow(rows[0])];
          const colCount = (rows[0].content || []).length;
          lines.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');
          for (let r = 1; r < rows.length; r++) lines.push(toRow(rows[r]));
          return lines.join('\n');
        }
        case 'listItem':
        case 'taskItem':
          return (node.content || []).map((c: any) => blockToMd(c)).join('\n');
        default:
          // For unknown nodes with content, recurse
          if (children.length > 0) return children.map((c: any) => blockToMd(c)).join('\n');
          return '';
      }
    }

    return json.content.map((block: any) => blockToMd(block)).join('\n\n');
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveMsg('请输入标题');
      setTimeout(() => setSaveMsg(''), 3000);
      return;
    }

    setSaving(true);
    setSaveMsg('');
    try {
      const content = htmlToMarkdown();
      const frontmatter = {
        title,
        description,
        pubDate,
        category: category.trim() || '未分类',
        tags,
        updatedDate: isNew ? null : new Date().toISOString().split('T')[0],
      };

      if (isNew) {
        const s = newSlug.trim() || title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
        await createPost({ slug: s, frontmatter, content });
        setSaveMsg('创建成功！');
        setTimeout(() => navigate(`/edit/${s}`), 1000);
      } else {
        await updatePost(slug!, { frontmatter, content });
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

  // Auto-save: debounce 30 seconds after any edit (only for existing posts)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');

  useEffect(() => {
    if (isNew || !editor || !slug || !title.trim()) return;

    const onUpdate = () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(async () => {
        try {
          const content = htmlToMarkdown();
          // Skip save if content hasn't changed
          const snapshot = JSON.stringify({ title, description, pubDate, category, tags, content });
          if (snapshot === lastSavedRef.current) return;
          lastSavedRef.current = snapshot;

          const frontmatter = {
            title, description, pubDate, category: category.trim() || '未分类', tags,
            updatedDate: new Date().toISOString().split('T')[0],
          };
          await updatePost(slug, { frontmatter, content });
          setSaveMsg('自动保存 ✓');
          setTimeout(() => setSaveMsg(''), 2000);
        } catch {
          // Silent fail for auto-save
        }
      }, 30000);
    };

    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [editor, slug, isNew, title, description, pubDate, category, tags]);

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

  // Slash command items
  const yaoSlashItems: SlashItem[] = [
    { id: 'yin-yao', label: '阴爻', desc: '易经阴爻符号', shortcut: '⚋', icon: <span className="text-lg leading-none">⚋</span>,
      action: () => insertSymbol('⚋') },
    { id: 'yang-yao', label: '阳爻', desc: '易经阳爻符号', shortcut: '⚊', icon: <span className="text-lg leading-none">⚊</span>,
      action: () => insertSymbol('⚊') },
  ];

  const baguaSlashItems: SlashItem[] = [
    { id: 'qian', label: '乾', desc: '天卦', shortcut: '☰', icon: <span className="text-lg leading-none">☰</span>,
      action: () => insertSymbol('☰') },
    { id: 'dui', label: '兑', desc: '泽卦', shortcut: '☱', icon: <span className="text-lg leading-none">☱</span>,
      action: () => insertSymbol('☱') },
    { id: 'li', label: '离', desc: '火卦', shortcut: '☲', icon: <span className="text-lg leading-none">☲</span>,
      action: () => insertSymbol('☲') },
    { id: 'zhen', label: '震', desc: '雷卦', shortcut: '☳', icon: <span className="text-lg leading-none">☳</span>,
      action: () => insertSymbol('☳') },
    { id: 'xun', label: '巽', desc: '风卦', shortcut: '☴', icon: <span className="text-lg leading-none">☴</span>,
      action: () => insertSymbol('☴') },
    { id: 'kan', label: '坎', desc: '水卦', shortcut: '☵', icon: <span className="text-lg leading-none">☵</span>,
      action: () => insertSymbol('☵') },
    { id: 'gen', label: '艮', desc: '山卦', shortcut: '☶', icon: <span className="text-lg leading-none">☶</span>,
      action: () => insertSymbol('☶') },
    { id: 'kun', label: '坤', desc: '地卦', shortcut: '☷', icon: <span className="text-lg leading-none">☷</span>,
      action: () => insertSymbol('☷') },
  ];

  const hexagramSlashItems: SlashItem[] = [
    { id: 'hex-qian', label: '乾', desc: '第一卦', shortcut: '䷀', icon: <span className="text-base leading-none">䷀</span>, action: () => insertSymbol('䷀') },
    { id: 'hex-kun', label: '坤', desc: '第二卦', shortcut: '䷁', icon: <span className="text-base leading-none">䷁</span>, action: () => insertSymbol('䷁') },
    { id: 'hex-zhun', label: '屯', desc: '第三卦', shortcut: '䷂', icon: <span className="text-base leading-none">䷂</span>, action: () => insertSymbol('䷂') },
    { id: 'hex-meng', label: '蒙', desc: '第四卦', shortcut: '䷃', icon: <span className="text-base leading-none">䷃</span>, action: () => insertSymbol('䷃') },
    { id: 'hex-xu', label: '需', desc: '第五卦', shortcut: '䷄', icon: <span className="text-base leading-none">䷄</span>, action: () => insertSymbol('䷄') },
    { id: 'hex-song', label: '讼', desc: '第六卦', shortcut: '䷅', icon: <span className="text-base leading-none">䷅</span>, action: () => insertSymbol('䷅') },
    { id: 'hex-shi', label: '师', desc: '第七卦', shortcut: '䷆', icon: <span className="text-base leading-none">䷆</span>, action: () => insertSymbol('䷆') },
    { id: 'hex-bi', label: '比', desc: '第八卦', shortcut: '䷇', icon: <span className="text-base leading-none">䷇</span>, action: () => insertSymbol('䷇') },
    { id: 'hex-xiaoxu', label: '小畜', desc: '第九卦', shortcut: '䷈', icon: <span className="text-base leading-none">䷈</span>, action: () => insertSymbol('䷈') },
    { id: 'hex-lu', label: '履', desc: '第十卦', shortcut: '䷉', icon: <span className="text-base leading-none">䷉</span>, action: () => insertSymbol('䷉') },
    { id: 'hex-tai', label: '泰', desc: '第十一卦', shortcut: '䷊', icon: <span className="text-base leading-none">䷊</span>, action: () => insertSymbol('䷊') },
    { id: 'hex-pi', label: '否', desc: '第十二卦', shortcut: '䷋', icon: <span className="text-base leading-none">䷋</span>, action: () => insertSymbol('䷋') },
    { id: 'hex-tongren', label: '同人', desc: '第十三卦', shortcut: '䷌', icon: <span className="text-base leading-none">䷌</span>, action: () => insertSymbol('䷌') },
    { id: 'hex-dayou', label: '大有', desc: '第十四卦', shortcut: '䷍', icon: <span className="text-base leading-none">䷍</span>, action: () => insertSymbol('䷍') },
    { id: 'hex-qian2', label: '谦', desc: '第十五卦', shortcut: '䷎', icon: <span className="text-base leading-none">䷎</span>, action: () => insertSymbol('䷎') },
    { id: 'hex-yu', label: '豫', desc: '第十六卦', shortcut: '䷏', icon: <span className="text-base leading-none">䷏</span>, action: () => insertSymbol('䷏') },
    { id: 'hex-sui', label: '随', desc: '第十七卦', shortcut: '䷐', icon: <span className="text-base leading-none">䷐</span>, action: () => insertSymbol('䷐') },
    { id: 'hex-gu', label: '蛊', desc: '第十八卦', shortcut: '䷑', icon: <span className="text-base leading-none">䷑</span>, action: () => insertSymbol('䷑') },
    { id: 'hex-lin', label: '临', desc: '第十九卦', shortcut: '䷒', icon: <span className="text-base leading-none">䷒</span>, action: () => insertSymbol('䷒') },
    { id: 'hex-guan', label: '观', desc: '第二十卦', shortcut: '䷓', icon: <span className="text-base leading-none">䷓</span>, action: () => insertSymbol('䷓') },
    { id: 'hex-shihe', label: '噬嗑', desc: '第二十一卦', shortcut: '䷔', icon: <span className="text-base leading-none">䷔</span>, action: () => insertSymbol('䷔') },
    { id: 'hex-bi2', label: '贲', desc: '第二十二卦', shortcut: '䷕', icon: <span className="text-base leading-none">䷕</span>, action: () => insertSymbol('䷕') },
    { id: 'hex-bo', label: '剥', desc: '第二十三卦', shortcut: '䷖', icon: <span className="text-base leading-none">䷖</span>, action: () => insertSymbol('䷖') },
    { id: 'hex-fu', label: '复', desc: '第二十四卦', shortcut: '䷗', icon: <span className="text-base leading-none">䷗</span>, action: () => insertSymbol('䷗') },
    { id: 'hex-wuwang', label: '无妄', desc: '第二十五卦', shortcut: '䷘', icon: <span className="text-base leading-none">䷘</span>, action: () => insertSymbol('䷘') },
    { id: 'hex-daxu', label: '大畜', desc: '第二十六卦', shortcut: '䷙', icon: <span className="text-base leading-none">䷙</span>, action: () => insertSymbol('䷙') },
    { id: 'hex-yi', label: '颐', desc: '第二十七卦', shortcut: '䷚', icon: <span className="text-base leading-none">䷚</span>, action: () => insertSymbol('䷚') },
    { id: 'hex-daguo', label: '大过', desc: '第二十八卦', shortcut: '䷛', icon: <span className="text-base leading-none">䷛</span>, action: () => insertSymbol('䷛') },
    { id: 'hex-kan2', label: '坎', desc: '第二十九卦', shortcut: '䷜', icon: <span className="text-base leading-none">䷜</span>, action: () => insertSymbol('䷜') },
    { id: 'hex-li2', label: '离', desc: '第三十卦', shortcut: '䷝', icon: <span className="text-base leading-none">䷝</span>, action: () => insertSymbol('䷝') },
    { id: 'hex-xian', label: '咸', desc: '第三十一卦', shortcut: '䷞', icon: <span className="text-base leading-none">䷞</span>, action: () => insertSymbol('䷞') },
    { id: 'hex-heng', label: '恒', desc: '第三十二卦', shortcut: '䷟', icon: <span className="text-base leading-none">䷟</span>, action: () => insertSymbol('䷟') },
    { id: 'hex-dun', label: '遁', desc: '第三十三卦', shortcut: '䷠', icon: <span className="text-base leading-none">䷠</span>, action: () => insertSymbol('䷠') },
    { id: 'hex-dazhuang', label: '大壮', desc: '第三十四卦', shortcut: '䷡', icon: <span className="text-base leading-none">䷡</span>, action: () => insertSymbol('䷡') },
    { id: 'hex-jin', label: '晋', desc: '第三十五卦', shortcut: '䷢', icon: <span className="text-base leading-none">䷢</span>, action: () => insertSymbol('䷢') },
    { id: 'hex-mingyi', label: '明夷', desc: '第三十六卦', shortcut: '䷣', icon: <span className="text-base leading-none">䷣</span>, action: () => insertSymbol('䷣') },
    { id: 'hex-jiaren', label: '家人', desc: '第三十七卦', shortcut: '䷤', icon: <span className="text-base leading-none">䷤</span>, action: () => insertSymbol('䷤') },
    { id: 'hex-kui', label: '睽', desc: '第三十八卦', shortcut: '䷥', icon: <span className="text-base leading-none">䷥</span>, action: () => insertSymbol('䷥') },
    { id: 'hex-jian', label: '蹇', desc: '第三十九卦', shortcut: '䷦', icon: <span className="text-base leading-none">䷦</span>, action: () => insertSymbol('䷦') },
    { id: 'hex-jie', label: '解', desc: '第四十卦', shortcut: '䷧', icon: <span className="text-base leading-none">䷧</span>, action: () => insertSymbol('䷧') },
    { id: 'hex-sun', label: '损', desc: '第四十一卦', shortcut: '䷨', icon: <span className="text-base leading-none">䷨</span>, action: () => insertSymbol('䷨') },
    { id: 'hex-yi2', label: '益', desc: '第四十二卦', shortcut: '䷩', icon: <span className="text-base leading-none">䷩</span>, action: () => insertSymbol('䷩') },
    { id: 'hex-guai', label: '夬', desc: '第四十三卦', shortcut: '䷪', icon: <span className="text-base leading-none">䷪</span>, action: () => insertSymbol('䷪') },
    { id: 'hex-gou', label: '姤', desc: '第四十四卦', shortcut: '䷫', icon: <span className="text-base leading-none">䷫</span>, action: () => insertSymbol('䷫') },
    { id: 'hex-cui', label: '萃', desc: '第四十五卦', shortcut: '䷬', icon: <span className="text-base leading-none">䷬</span>, action: () => insertSymbol('䷬') },
    { id: 'hex-sheng', label: '升', desc: '第四十六卦', shortcut: '䷭', icon: <span className="text-base leading-none">䷭</span>, action: () => insertSymbol('䷭') },
    { id: 'hex-kun3', label: '困', desc: '第四十七卦', shortcut: '䷮', icon: <span className="text-base leading-none">䷮</span>, action: () => insertSymbol('䷮') },
    { id: 'hex-jing', label: '井', desc: '第四十八卦', shortcut: '䷯', icon: <span className="text-base leading-none">䷯</span>, action: () => insertSymbol('䷯') },
    { id: 'hex-ge', label: '革', desc: '第四十九卦', shortcut: '䷰', icon: <span className="text-base leading-none">䷰</span>, action: () => insertSymbol('䷰') },
    { id: 'hex-ding', label: '鼎', desc: '第五十卦', shortcut: '䷱', icon: <span className="text-base leading-none">䷱</span>, action: () => insertSymbol('䷱') },
    { id: 'hex-zhen2', label: '震', desc: '第五十一卦', shortcut: '䷲', icon: <span className="text-base leading-none">䷲</span>, action: () => insertSymbol('䷲') },
    { id: 'hex-gen2', label: '艮', desc: '第五十二卦', shortcut: '䷳', icon: <span className="text-base leading-none">䷳</span>, action: () => insertSymbol('䷳') },
    { id: 'hex-jian2', label: '渐', desc: '第五十三卦', shortcut: '䷴', icon: <span className="text-base leading-none">䷴</span>, action: () => insertSymbol('䷴') },
    { id: 'hex-guimei', label: '归妹', desc: '第五十四卦', shortcut: '䷵', icon: <span className="text-base leading-none">䷵</span>, action: () => insertSymbol('䷵') },
    { id: 'hex-feng', label: '丰', desc: '第五十五卦', shortcut: '䷶', icon: <span className="text-base leading-none">䷶</span>, action: () => insertSymbol('䷶') },
    { id: 'hex-lv', label: '旅', desc: '第五十六卦', shortcut: '䷷', icon: <span className="text-base leading-none">䷷</span>, action: () => insertSymbol('䷷') },
    { id: 'hex-xun2', label: '巽', desc: '第五十七卦', shortcut: '䷸', icon: <span className="text-base leading-none">䷸</span>, action: () => insertSymbol('䷸') },
    { id: 'hex-dui2', label: '兑', desc: '第五十八卦', shortcut: '䷹', icon: <span className="text-base leading-none">䷹</span>, action: () => insertSymbol('䷹') },
    { id: 'hex-huan', label: '涣', desc: '第五十九卦', shortcut: '䷺', icon: <span className="text-base leading-none">䷺</span>, action: () => insertSymbol('䷺') },
    { id: 'hex-jie2', label: '节', desc: '第六十卦', shortcut: '䷻', icon: <span className="text-base leading-none">䷻</span>, action: () => insertSymbol('䷻') },
    { id: 'hex-zhongfu', label: '中孚', desc: '第六十一卦', shortcut: '䷼', icon: <span className="text-base leading-none">䷼</span>, action: () => insertSymbol('䷼') },
    { id: 'hex-xiaoguo', label: '小过', desc: '第六十二卦', shortcut: '䷽', icon: <span className="text-base leading-none">䷽</span>, action: () => insertSymbol('䷽') },
    { id: 'hex-jiji', label: '既济', desc: '第六十三卦', shortcut: '䷾', icon: <span className="text-base leading-none">䷾</span>, action: () => insertSymbol('䷾') },
    { id: 'hex-weiji', label: '未济', desc: '第六十四卦', shortcut: '䷿', icon: <span className="text-base leading-none">䷿</span>, action: () => insertSymbol('䷿') },
  ];

  const yijingGroups: YijingGroup[] = [
    { id: 'yao', title: '阴阳爻', items: yaoSlashItems },
    { id: 'bagua', title: '八卦', items: baguaSlashItems },
    { id: 'hexagrams', title: '六十四卦', items: hexagramSlashItems },
  ];

  const yijingSlashItems = yijingGroups.flatMap((group) => group.items);

  const slashItems: SlashItem[] = [
    { id: 'h1', label: '标题 1', desc: '大标题', shortcut: '#', icon: <Heading1 className="w-4 h-4" />,
      action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'h2', label: '标题 2', desc: '中标题', shortcut: '##', icon: <Heading2 className="w-4 h-4" />,
      action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'h3', label: '标题 3', desc: '小标题', shortcut: '###', icon: <Heading3 className="w-4 h-4" />,
      action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: 'bullet', label: '无序列表', desc: '列表项', shortcut: '-', icon: <List className="w-4 h-4" />,
      action: () => editor?.chain().focus().toggleBulletList().run() },
    { id: 'ordered', label: '有序列表', desc: '编号列表', shortcut: '1.', icon: <ListOrdered className="w-4 h-4" />,
      action: () => editor?.chain().focus().toggleOrderedList().run() },
    { id: 'task', label: '待办列表', desc: '复选框列表', shortcut: '[]', icon: <CheckSquare className="w-4 h-4" />,
      action: () => editor?.chain().focus().toggleTaskList().run() },
    { id: 'quote', label: '引用', desc: '引用块', shortcut: '>', icon: <Quote className="w-4 h-4" />,
      action: () => editor?.chain().focus().toggleBlockquote().run() },
    { id: 'code', label: '代码块', desc: '代码片段', shortcut: '```', icon: <FileCode2 className="w-4 h-4" />,
      action: () => editor?.chain().focus().toggleCodeBlock().run() },
    { id: 'mermaid', label: 'Mermaid 图', desc: '流程图、时序图等', shortcut: '```mermaid', icon: <FileCode2 className="w-4 h-4" />,
      action: () => editor?.chain().focus().insertContent({
        type: 'codeBlock',
        attrs: { language: 'mermaid' },
        content: [{ type: 'text', text: 'graph TD\n  A[开始] --> B[完成]' }],
      }).run() },
    { id: 'hr', label: '分割线', desc: '水平分隔线', shortcut: '---', icon: <Minus className="w-4 h-4" />,
      action: () => editor?.chain().focus().setHorizontalRule().run() },
    { id: 'image', label: '图片', desc: '上传图片', shortcut: '', icon: <ImageIcon className="w-4 h-4" />,
      action: () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); };
        input.click();
      }},
    { id: 'table', label: '表格', desc: '插入表格', shortcut: '', icon: <TableIcon className="w-4 h-4" />,
      action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'math-block', label: '公式块', desc: 'LaTeX 独立公式', shortcut: '$$', icon: <Sigma className="w-4 h-4" />,
      action: () => { setMathDialog({ type: 'block' }); setMathFormula(''); }},
    { id: 'math-inline', label: '行内公式', desc: 'LaTeX 行内公式', shortcut: '$', icon: <span className="text-sm font-bold">∑</span>,
      action: () => { setMathDialog({ type: 'inline' }); setMathFormula(''); }},
    {
      id: 'yijing-symbols',
      label: '易经符号',
      desc: '阴爻、阳爻与八卦',
      icon: <span className="text-sm font-semibold leading-none">易</span>,
      children: yijingSlashItems,
    },
  ];

  const filteredSlashItems = slashItems.filter(item =>
    slashFilter === '' ||
    item.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
    item.id.toLowerCase().includes(slashFilter.toLowerCase()) ||
    item.desc.toLowerCase().includes(slashFilter.toLowerCase()) ||
    item.children?.some((child) =>
      child.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
      child.id.toLowerCase().includes(slashFilter.toLowerCase()) ||
      child.desc.toLowerCase().includes(slashFilter.toLowerCase())
    )
  );

  const activeSlashItem = filteredSlashItems[Math.min(slashIndex, filteredSlashItems.length - 1)];
  const showYijingPanel =
    slashSubmenuId === 'yijing-symbols' ||
    (activeSlashItem?.id === 'yijing-symbols' && !!activeSlashItem.children?.length);
  const normalizedSlashFilter = slashFilter.trim().toLowerCase();
  const visibleYijingGroups = yijingGroups.map((group) => ({
    ...group,
    items: normalizedSlashFilter
      ? group.items.filter((item) =>
          item.label.toLowerCase().includes(normalizedSlashFilter) ||
          item.id.toLowerCase().includes(normalizedSlashFilter) ||
          item.desc.toLowerCase().includes(normalizedSlashFilter)
        )
      : group.items,
  }));

  // Execute slash command — delete the /query text, then run the action
  const executeSlashCommand = useCallback((item: SlashItem) => {
    if (!editor) return;
    if (item.children?.length) {
      setSlashSubmenuId(item.id);
      return;
    }
    setSlashOpen(false);
    setSlashSubmenuId(null);
    // Delete the slash and any filter text
    const { from } = editor.state.selection;
    editor.chain().focus()
      .deleteRange({ from: slashFromPos.current, to: from })
      .run();
    item.action?.();
  }, [editor, slashFromPos]);

  // Listen for slash-execute custom event (from Enter keypress)
  useEffect(() => {
    const handler = () => {
      const items = filteredSlashItems;
      const idx = Math.min(slashIndex, items.length - 1);
      if (items[idx]) executeSlashCommand(items[idx]);
    };
    document.addEventListener('slash-execute', handler);
    return () => document.removeEventListener('slash-execute', handler);
  }, [filteredSlashItems, slashIndex, executeSlashCommand]);

  // Focus math dialog input when opened
  useEffect(() => {
    if (mathDialog && mathInputRef.current) {
      setTimeout(() => mathInputRef.current?.focus(), 50);
    }
  }, [mathDialog]);

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

  const handleImageButton = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) handleImageUpload(file);
    };
    input.click();
  };

  const copyActiveCodeBlock = async () => {
    if (!editor) return;
    const { $from } = editor.state.selection;

    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === 'codeBlock') {
        await navigator.clipboard?.writeText(node.textContent || '');
        return;
      }
    }
  };

  if (!editor) return null;

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="border-b border-notion-border sticky top-0 bg-white/80 backdrop-blur-sm z-30">
        <div className="max-w-4xl mx-auto px-6 py-2.5 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-sm text-notion-text-secondary hover:text-notion-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span className="text-xs text-notion-text-secondary">{saveMsg}</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-notion-accent text-white rounded-md hover:bg-notion-accent-hover disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? '保存中...' : isNew ? '创建' : '保存'}
            </button>
          </div>
        </div>
      </header>

      {/* Bubble menu (appears on text selection - Notion style) */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 150, placement: 'top' }}
        className="bg-white rounded-lg shadow-lg border border-notion-border flex items-center divide-x divide-notion-border overflow-visible"
      >
        {/* Turn Into dropdown */}
        <div className="relative px-1 py-1">
          <button
            onClick={() => { setShowTurnInto(!showTurnInto); setShowColorPicker(false); }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-notion-text hover:bg-notion-bg-hover rounded transition-colors"
          >
            <CurrentBlockLabel editor={editor} />
            <ChevronDown className="w-3 h-3 text-notion-text-secondary" />
          </button>
          {showTurnInto && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-notion-border py-1 z-50 w-52">
              <div className="text-[10px] text-notion-text-secondary uppercase tracking-wider px-3 py-1">Turn into</div>
              <TurnIntoItem icon={<Pilcrow className="w-4 h-4" />} label="正文" desc="Text"
                active={editor.isActive('paragraph')}
                onClick={() => { editor.chain().focus().setParagraph().run(); setShowTurnInto(false); }} />
              <TurnIntoItem icon={<Heading1 className="w-4 h-4" />} label="标题 1" desc="Heading 1"
                active={editor.isActive('heading', { level: 1 })}
                onClick={() => { editor.chain().focus().toggleHeading({ level: 1 }).run(); setShowTurnInto(false); }} />
              <TurnIntoItem icon={<Heading2 className="w-4 h-4" />} label="标题 2" desc="Heading 2"
                active={editor.isActive('heading', { level: 2 })}
                onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); setShowTurnInto(false); }} />
              <TurnIntoItem icon={<Heading3 className="w-4 h-4" />} label="标题 3" desc="Heading 3"
                active={editor.isActive('heading', { level: 3 })}
                onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run(); setShowTurnInto(false); }} />
              <TurnIntoItem icon={<List className="w-4 h-4" />} label="无序列表" desc="Bullet list"
                active={editor.isActive('bulletList')}
                onClick={() => { editor.chain().focus().toggleBulletList().run(); setShowTurnInto(false); }} />
              <TurnIntoItem icon={<ListOrdered className="w-4 h-4" />} label="有序列表" desc="Numbered list"
                active={editor.isActive('orderedList')}
                onClick={() => { editor.chain().focus().toggleOrderedList().run(); setShowTurnInto(false); }} />
              <TurnIntoItem icon={<ListTodo className="w-4 h-4" />} label="待办列表" desc="To-do list"
                active={editor.isActive('taskList')}
                onClick={() => { editor.chain().focus().toggleTaskList().run(); setShowTurnInto(false); }} />
              <TurnIntoItem icon={<TextQuote className="w-4 h-4" />} label="引用" desc="Quote"
                active={editor.isActive('blockquote')}
                onClick={() => { editor.chain().focus().toggleBlockquote().run(); setShowTurnInto(false); }} />
              <TurnIntoItem icon={<FileCode2 className="w-4 h-4" />} label="代码块" desc="Code block"
                active={editor.isActive('codeBlock')}
                onClick={() => { editor.chain().focus().toggleCodeBlock().run(); setShowTurnInto(false); }} />
            </div>
          )}
        </div>

        {/* Text formatting */}
        <div className="flex items-center px-1 py-1 gap-0.5">
          <BubbleBtn
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </BubbleBtn>
          <BubbleBtn
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </BubbleBtn>
          <BubbleBtn
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </BubbleBtn>
          <BubbleBtn
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </BubbleBtn>
          <BubbleBtn
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Inline Code"
          >
            <Code className="w-3.5 h-3.5" />
          </BubbleBtn>
          <BubbleBtn
            active={editor.isActive('link')}
            onClick={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run();
              } else {
                const url = window.prompt('输入链接 URL:', 'https://');
                if (url) editor.chain().focus().setLink({ href: url }).run();
              }
            }}
            title={editor.isActive('link') ? '取消链接' : '添加链接'}
          >
            <Link2 className="w-3.5 h-3.5" />
          </BubbleBtn>
        </div>

        {/* Color panel (combined text color + background color, Notion style) */}
        <div className="relative px-1 py-1">
          <button
            onClick={() => { setShowColorPicker(!showColorPicker); setShowTurnInto(false); }}
            className={`flex items-center gap-0.5 p-1.5 rounded transition-colors ${
              showColorPicker ? 'bg-notion-accent/10 text-notion-accent' : 'text-notion-text hover:bg-notion-bg-hover'
            }`}
            title="颜色"
          >
            <span className="font-bold text-xs leading-none" style={{ color: '#37352f' }}>A</span>
            <ChevronDown className="w-2.5 h-2.5 text-notion-text-secondary" />
          </button>
          {showColorPicker && (
            <NotionColorPanel
              editor={editor}
              onClose={() => setShowColorPicker(false)}
            />
          )}
        </div>
      </BubbleMenu>

      <BubbleMenu
        editor={editor}
        shouldShow={({ editor }) => editor.isActive('codeBlock')}
        tippyOptions={{ duration: 150, placement: 'bottom-start' }}
        className="flex items-center gap-1 rounded-xl border border-notion-border bg-white/95 px-2 py-1 shadow-xl backdrop-blur"
      >
        <select
          value={editor.getAttributes('codeBlock').language || ''}
          onChange={(e) => {
            editor.chain().focus().updateAttributes('codeBlock', {
              language: e.target.value || null,
            }).run();
          }}
          className="h-8 rounded-lg border border-notion-border bg-notion-bg px-2 text-xs text-notion-text outline-none transition-colors hover:bg-notion-bg-hover focus:border-notion-accent"
          title="代码语言"
        >
          {CODE_LANGUAGES.map((lang) => (
            <option key={lang.value || 'plain'} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().updateAttributes('codeBlock', {
              language: 'mermaid',
            }).run();
          }}
          className={`h-8 rounded-lg px-2 text-xs font-medium transition-colors ${
            (editor.getAttributes('codeBlock').language || '').toLowerCase() === 'mermaid'
              ? 'bg-notion-accent/10 text-notion-accent'
              : 'text-notion-text-secondary hover:bg-notion-bg-hover hover:text-notion-text'
          }`}
          title="切换为 Mermaid 图表"
        >
          Mermaid
        </button>
        <button
          type="button"
          onClick={copyActiveCodeBlock}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-notion-text-secondary transition-colors hover:bg-notion-bg-hover hover:text-notion-text"
          title="复制代码"
        >
          <Copy className="h-4 w-4" />
        </button>
      </BubbleMenu>

      {/* Main editor area */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Frontmatter: Slug (new only) */}
        {isNew && (
          <div className="mb-6">
            <label className="block text-xs text-notion-text-secondary mb-1 font-medium">
              文件名 (slug)
            </label>
            <input
              type="text"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="my-article-slug（留空则根据标题生成）"
              className="w-full px-3 py-2 text-sm border border-notion-border rounded-md focus:outline-none focus:border-notion-accent transition-colors"
            />
          </div>
        )}

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="无标题"
          className="w-full text-[40px] font-bold text-notion-text placeholder:text-notion-text-placeholder focus:outline-none leading-tight mb-2"
        />

        {/* Description */}
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="添加描述..."
          className="w-full text-base text-notion-text-secondary placeholder:text-notion-text-placeholder focus:outline-none mb-4"
        />

        {/* Meta: date, category & tags */}
        <div className="flex flex-wrap items-center gap-4 mb-8 pb-6 border-b border-notion-border text-sm">
          <div className="flex items-center gap-1.5 text-notion-text-secondary">
            <Calendar className="w-3.5 h-3.5" />
            <input
              type="date"
              value={pubDate}
              onChange={(e) => setPubDate(e.target.value)}
              className="bg-transparent focus:outline-none text-notion-text"
            />
          </div>
          <div className="flex items-center gap-1.5 text-notion-text-secondary">
            <Tag className="w-3.5 h-3.5" />
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="分类，例如：AI、后端、随笔"
              className="min-w-[180px] bg-transparent focus:outline-none text-notion-text"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-notion-text-secondary" />
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-notion-bg-hover rounded text-notion-text"
              >
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              onBlur={addTag}
              placeholder="添加标签..."
              className="bg-transparent focus:outline-none text-xs text-notion-text-secondary w-24"
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 mb-4 pb-3 border-b border-notion-border">
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1">
            <Heading1 className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2">
            <Heading2 className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3">
            <Heading3 className="w-4 h-4" />
          </ToolBtn>
          <div className="w-px h-5 bg-notion-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
            <List className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
            <ListOrdered className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="任务列表">
            <CheckSquare className="w-4 h-4" />
          </ToolBtn>
          <div className="w-px h-5 bg-notion-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
            <Quote className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块">
            <Code className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().insertContent({
              type: 'codeBlock',
              attrs: { language: 'mermaid' },
              content: [{ type: 'text', text: 'graph TD\n  A[开始] --> B[完成]' }],
            }).run()}
            title="Mermaid 图表"
          >
            <FileCode2 className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分割线">
            <Minus className="w-4 h-4" />
          </ToolBtn>
          <div className="w-px h-5 bg-notion-border mx-1" />
          <ToolBtn onClick={handleImageButton} title="插入图片">
            <ImageIcon className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="插入表格"
          >
            <TableIcon className="w-4 h-4" />
          </ToolBtn>
          <div className="w-px h-5 bg-notion-border mx-1" />
          <ToolBtn
            onClick={() => { setMathDialog({ type: 'block' }); setMathFormula(''); }}
            title="插入公式块"
          >
            <Sigma className="w-4 h-4" />
          </ToolBtn>
          <ToolBtn
            onClick={() => { setMathDialog({ type: 'inline' }); setMathFormula(''); }}
            title="插入行内公式"
          >
            <span className="text-xs font-bold leading-none">∑</span>
          </ToolBtn>
        </div>

        {loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {/* Editor content (relative for slash menu positioning) */}
        <div className="relative">
          <EditorContent editor={editor} className="min-h-[50vh]" />

          {/* Slash command menu */}
          {slashOpen && filteredSlashItems.length > 0 && slashPos.current && (
            <div
              className="absolute z-50 flex items-start gap-2"
              style={{ top: slashPos.current.top, left: slashPos.current.left }}
            >
              <div className="bg-white rounded-xl shadow-2xl border border-notion-border py-2 w-72 max-h-80 overflow-y-auto">
                <div className="px-3 py-1.5 text-[10px] text-notion-text-secondary uppercase tracking-wider">
                  基础块
                </div>
                {filteredSlashItems.map((item, idx) => {
                  const isActive = idx === Math.min(slashIndex, filteredSlashItems.length - 1);
                  const isExpanded = slashSubmenuId === item.id || (isActive && !!item.children?.length);

                  return (
                    <button
                      key={item.id}
                      onClick={() => executeSlashCommand(item)}
                      onMouseEnter={() => {
                        setSlashIndex(idx);
                        setSlashSubmenuId(item.children?.length ? item.id : null);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'bg-notion-bg-hover'
                          : 'hover:bg-notion-bg-hover/50'
                      }`}
                    >
                      <span className="w-8 h-8 rounded-md border border-notion-border/60 flex items-center justify-center bg-white text-notion-text-secondary shrink-0">
                        {item.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-notion-text font-medium">{item.label}</div>
                        <div className="text-[11px] text-notion-text-secondary">{item.desc}</div>
                      </div>
                      {item.children?.length ? (
                        <ChevronRight className={`w-4 h-4 shrink-0 ${isExpanded ? 'text-notion-text' : 'text-notion-text-placeholder'}`} />
                      ) : item.shortcut ? (
                        <span className="text-[11px] text-notion-text-placeholder font-mono">{item.shortcut}</span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredSlashItems.length === 0 && (
                  <div className="px-3 py-4 text-sm text-notion-text-secondary text-center">
                    没有匹配的命令
                  </div>
                )}
              </div>

              {showYijingPanel && (
                <div className="bg-white rounded-xl shadow-2xl border border-notion-border p-3 w-[860px] max-w-[calc(100vw-6rem)]">
                  <div className="px-1 pb-2 text-[10px] text-notion-text-secondary uppercase tracking-wider">
                    易经符号
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {visibleYijingGroups.map((group) => (
                      <div key={group.id} className="min-w-0 rounded-lg border border-notion-border/70 overflow-hidden">
                        <div className="px-3 py-2 text-xs font-semibold text-notion-text bg-notion-bg-hover/60 border-b border-notion-border">
                          {group.title}
                        </div>
                        <div className={`overflow-y-auto ${group.id === 'hexagrams' ? 'max-h-80' : 'max-h-64'}`}>
                          {group.items.length > 0 ? (
                            group.items.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => executeSlashCommand(item)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-notion-bg-hover/50"
                              >
                                <span className="w-8 h-8 rounded-md border border-notion-border/60 flex items-center justify-center bg-white text-notion-text-secondary shrink-0">
                                  {item.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-notion-text font-medium">{item.label}</div>
                                  <div className="text-[11px] text-notion-text-secondary">{item.desc}</div>
                                </div>
                                {item.shortcut && (
                                  <span className="text-[11px] text-notion-text-placeholder font-mono">{item.shortcut}</span>
                                )}
                              </button>
                            ))
                          ) : (
                            <div className="px-3 py-6 text-center text-xs text-notion-text-secondary">
                              没有匹配项
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Math formula dialog — centered modal */}
        {mathDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setMathDialog(null); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-notion-border w-[520px] max-w-[90vw] p-6">
              <h3 className="text-lg font-semibold text-notion-text mb-1">
                {mathDialog.type === 'block' ? '插入公式块' : '插入行内公式'}
              </h3>
              <p className="text-sm text-notion-text-secondary mb-4">
                输入 LaTeX 公式
              </p>
              <textarea
                ref={mathInputRef}
                value={mathFormula}
                onChange={(e) => setMathFormula(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleMathInsert();
                  }
                  if (e.key === 'Escape') setMathDialog(null);
                }}
                placeholder={mathDialog.type === 'block' ? 'E = mc^2' : 'x^2 + y^2'}
                className="w-full h-24 p-3 border border-notion-border rounded-lg bg-notion-bg text-notion-text font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-notion-accent/30 focus:border-notion-accent"
              />
              {mathFormula.trim() && (
                <div className="mt-3 p-3 bg-notion-bg-hover rounded-lg border border-notion-border/50 text-center min-h-[40px] flex items-center justify-center">
                  <span className="text-sm text-notion-text-secondary italic">预览需要在编辑器中查看</span>
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setMathDialog(null)}
                  className="px-4 py-2 text-sm text-notion-text-secondary hover:text-notion-text hover:bg-notion-bg-hover rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleMathInsert}
                  disabled={!mathFormula.trim()}
                  className="px-4 py-2 text-sm bg-notion-text text-white rounded-lg hover:bg-notion-text/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  确定 <span className="text-[10px] opacity-60 ml-1">Ctrl+Enter</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Sub components ---

function BubbleBtn({ children, active, onClick, title }: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors flex items-center gap-0.5 ${
        active ? 'bg-notion-accent/10 text-notion-accent' : 'text-notion-text hover:bg-notion-bg-hover'
      }`}
    >
      {children}
    </button>
  );
}

function ToolBtn({ children, active, onClick, title }: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-notion-accent/10 text-notion-accent' : 'text-notion-text-secondary hover:bg-notion-bg-hover hover:text-notion-text'
      }`}
    >
      {children}
    </button>
  );
}

// Current block type label for Turn Into button
function CurrentBlockLabel({ editor }: { editor: any }) {
  if (editor.isActive('heading', { level: 1 })) return <span>标题 1</span>;
  if (editor.isActive('heading', { level: 2 })) return <span>标题 2</span>;
  if (editor.isActive('heading', { level: 3 })) return <span>标题 3</span>;
  if (editor.isActive('bulletList')) return <span>无序列表</span>;
  if (editor.isActive('orderedList')) return <span>有序列表</span>;
  if (editor.isActive('taskList')) return <span>待办列表</span>;
  if (editor.isActive('blockquote')) return <span>引用</span>;
  if (editor.isActive('codeBlock')) return <span>代码块</span>;
  return <span>正文</span>;
}

// Turn Into dropdown item
function TurnIntoItem({ icon, label, desc, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-1.5 text-left hover:bg-notion-bg-hover transition-colors ${
        active ? 'bg-notion-accent/5 text-notion-accent' : 'text-notion-text'
      }`}
    >
      <span className="shrink-0 text-notion-text-secondary">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[10px] text-notion-text-secondary">{desc}</div>
      </div>
      {active && <span className="text-notion-accent text-xs">✓</span>}
    </button>
  );
}

// Notion-style combined color panel (text color + background color)
function NotionColorPanel({ editor, onClose }: { editor: any; onClose: () => void }) {
  return (
    <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-notion-border p-3 z-50 w-56">
      {/* Text color */}
      <div className="text-[10px] text-notion-text-secondary uppercase tracking-wider mb-2 px-0.5">
        文字颜色
      </div>
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {TEXT_COLORS.map(({ name, color }) => (
          <button
            key={name}
            onClick={() => { editor.chain().focus().setColor(color).run(); onClose(); }}
            title={name}
            className="w-8 h-8 rounded-md border border-notion-border/60 hover:border-notion-accent hover:scale-110 transition-all flex items-center justify-center"
          >
            <span style={{ color }} className="text-sm font-bold">A</span>
          </button>
        ))}
      </div>

      {/* Background color */}
      <div className="text-[10px] text-notion-text-secondary uppercase tracking-wider mb-2 px-0.5">
        背景颜色
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {BG_COLORS.map(({ name, color }) => (
          <button
            key={name}
            onClick={() => {
              if (color === 'transparent') {
                editor.chain().focus().unsetHighlight().run();
              } else {
                editor.chain().focus().toggleHighlight({ color }).run();
              }
              onClose();
            }}
            title={name}
            className="w-8 h-8 rounded-md border border-notion-border/60 hover:border-notion-accent hover:scale-110 transition-all flex items-center justify-center"
            style={{ backgroundColor: color === 'transparent' ? '#fff' : color }}
          >
            {color === 'transparent' && <X className="w-3.5 h-3.5 text-notion-text-placeholder" />}
          </button>
        ))}
      </div>

      {/* Reset button */}
      <button
        onClick={() => {
          editor.chain().focus().unsetColor().unsetHighlight().run();
          onClose();
        }}
        className="w-full mt-2 py-1.5 text-xs text-notion-text-secondary hover:text-notion-text hover:bg-notion-bg-hover rounded transition-colors"
      >
        重置为默认
      </button>
    </div>
  );
}
