// 编辑区上方的固定工具栏：块级插入与格式切换。
import type { Editor } from '@tiptap/react';
import {
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Code,
  FileCode2, Network, Minus, Image as ImageIcon, Table as TableIcon, Sigma,
} from 'lucide-react';
import { MINDMAP_TEMPLATE, MERMAID_TEMPLATE } from '../../lib/editorConfig';
import { ToolBtn } from './controls';

export function EditorToolbar({ editor, onPickImage, onOpenMath }: {
  editor: Editor;
  onPickImage: () => void;
  onOpenMath: (type: 'block' | 'inline') => void;
}) {
  return (
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
          content: [{ type: 'text', text: MERMAID_TEMPLATE }],
        }).run()}
        title="Mermaid 图表"
      >
        <FileCode2 className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().insertContent({
          type: 'codeBlock',
          attrs: { language: 'mindmap' },
          content: [{ type: 'text', text: MINDMAP_TEMPLATE }],
        }).run()}
        title="思维导图"
      >
        <Network className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分割线">
        <Minus className="w-4 h-4" />
      </ToolBtn>
      <div className="w-px h-5 bg-notion-border mx-1" />
      <ToolBtn onClick={onPickImage} title="插入图片">
        <ImageIcon className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="插入表格"
      >
        <TableIcon className="w-4 h-4" />
      </ToolBtn>
      <div className="w-px h-5 bg-notion-border mx-1" />
      <ToolBtn onClick={() => onOpenMath('block')} title="插入公式块">
        <Sigma className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => onOpenMath('inline')} title="插入行内公式">
        <span className="text-xs font-bold leading-none">∑</span>
      </ToolBtn>
    </div>
  );
}
