// 两个气泡菜单：选中文字的格式菜单、代码块的语言切换菜单。
// 弹层的开合状态在组件内部自持，Editor.tsx 不再关心。
import { useState } from 'react';
import { BubbleMenu, type Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link2,
  List, ListOrdered, Quote, Heading1, Heading2, Heading3, CheckSquare,
  ChevronDown, Pilcrow, Copy, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';
import { CODE_LANGUAGES } from '../../lib/editorConfig';
import { BubbleBtn, CurrentBlockLabel, TurnIntoItem, NotionColorPanel } from './controls';

/** 选中文字时出现的格式气泡菜单（Notion 风格） */
export function SelectionBubbleMenu({ editor }: { editor: Editor }) {
  const [showTurnInto, setShowTurnInto] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
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
            <TurnIntoItem icon={<List className="w-4 h-4" />} label="无序列表" desc="Bulleted list"
              active={editor.isActive('bulletList')}
              onClick={() => { editor.chain().focus().toggleBulletList().run(); setShowTurnInto(false); }} />
            <TurnIntoItem icon={<ListOrdered className="w-4 h-4" />} label="有序列表" desc="Numbered list"
              active={editor.isActive('orderedList')}
              onClick={() => { editor.chain().focus().toggleOrderedList().run(); setShowTurnInto(false); }} />
            <TurnIntoItem icon={<CheckSquare className="w-4 h-4" />} label="待办列表" desc="To-do list"
              active={editor.isActive('taskList')}
              onClick={() => { editor.chain().focus().toggleTaskList().run(); setShowTurnInto(false); }} />
            <TurnIntoItem icon={<Quote className="w-4 h-4" />} label="引用" desc="Quote"
              active={editor.isActive('blockquote')}
              onClick={() => { editor.chain().focus().toggleBlockquote().run(); setShowTurnInto(false); }} />
            <TurnIntoItem icon={<Code className="w-4 h-4" />} label="代码块" desc="Code block"
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

      {/* Text alignment */}
      <div className="flex items-center px-1 py-1 gap-0.5">
        <BubbleBtn
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          title="左对齐"
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          title="居中对齐"
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </BubbleBtn>
        <BubbleBtn
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          title="右对齐"
        >
          <AlignRight className="w-3.5 h-3.5" />
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
  );
}

/** 光标落在代码块内时出现的语言切换菜单 */
export function CodeBlockBubbleMenu({ editor }: { editor: Editor }) {
  const copyActiveCodeBlock = async () => {
    const { $from } = editor.state.selection;

    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === 'codeBlock') {
        await navigator.clipboard?.writeText(node.textContent || '');
        return;
      }
    }
  };

  return (
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
        onClick={() => {
          editor.chain().focus().updateAttributes('codeBlock', {
            language: 'mindmap',
          }).run();
        }}
        className={`h-8 rounded-lg px-2 text-xs font-medium transition-colors ${
          (editor.getAttributes('codeBlock').language || '').toLowerCase() === 'mindmap'
            ? 'bg-notion-accent/10 text-notion-accent'
            : 'text-notion-text-secondary hover:bg-notion-bg-hover hover:text-notion-text'
        }`}
        title="切换为思维导图"
      >
        思维导图
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
  );
}
