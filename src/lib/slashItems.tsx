// 斜杠菜单条目的构建工厂：把「菜单里有什么」从 Editor.tsx 里拆出来。
// 条目动作依赖 editor 实例和页面回调，所以以工厂函数形式提供。
import type { Editor } from '@tiptap/react';
import {
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote,
  FileCode2, Network, Minus, Image as ImageIcon, Table as TableIcon, Sigma,
} from 'lucide-react';
import { MINDMAP_TEMPLATE, MERMAID_TEMPLATE, YIJING_GROUPS } from './editorConfig';

export type SlashItem = {
  id: string;
  label: string;
  desc: string;
  shortcut?: string;
  icon: React.ReactNode;
  action?: () => void;
  children?: SlashItem[];
};

export type YijingGroup = {
  id: string;
  title: string;
  items: SlashItem[];
};

/** 易经符号组：从配置数据生成，动作统一为插入符号 */
export function buildYijingGroups(insertSymbol: (symbol: string) => void): YijingGroup[] {
  return YIJING_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    items: group.symbols.map((s) => ({
      id: s.id,
      label: s.label,
      desc: s.desc,
      shortcut: s.symbol,
      icon: (
        <span className={`${group.id === 'hexagrams' ? 'text-base' : 'text-lg'} leading-none`}>
          {s.symbol}
        </span>
      ),
      action: () => insertSymbol(s.symbol),
    })),
  }));
}

export function buildSlashItems(opts: {
  editor: Editor | null;
  openMathDialog: (type: 'block' | 'inline') => void;
  pickImage: () => void;
  yijingItems: SlashItem[];
}): SlashItem[] {
  const { editor, openMathDialog, pickImage, yijingItems } = opts;

  return [
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
        content: [{ type: 'text', text: MERMAID_TEMPLATE }],
      }).run() },
    { id: 'mindmap', label: '思维导图', desc: 'Tab 长子节点，Enter 平铺兄弟，布局自动算', shortcut: '```mindmap', icon: <Network className="w-4 h-4" />,
      action: () => editor?.chain().focus().insertContent({
        type: 'codeBlock',
        attrs: { language: 'mindmap' },
        content: [{ type: 'text', text: MINDMAP_TEMPLATE }],
      }).run() },
    { id: 'hr', label: '分割线', desc: '水平分隔线', shortcut: '---', icon: <Minus className="w-4 h-4" />,
      action: () => editor?.chain().focus().setHorizontalRule().run() },
    { id: 'image', label: '图片', desc: '上传图片', shortcut: '', icon: <ImageIcon className="w-4 h-4" />,
      action: pickImage },
    { id: 'table', label: '表格', desc: '插入表格', shortcut: '', icon: <TableIcon className="w-4 h-4" />,
      action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'math-block', label: '公式块', desc: 'LaTeX 独立公式', shortcut: '$$', icon: <Sigma className="w-4 h-4" />,
      action: () => openMathDialog('block') },
    { id: 'math-inline', label: '行内公式', desc: 'LaTeX 行内公式', shortcut: '$', icon: <span className="text-sm font-bold">∑</span>,
      action: () => openMathDialog('inline') },
    {
      id: 'yijing-symbols',
      label: '易经符号',
      desc: '阴爻、阳爻与八卦',
      icon: <span className="text-sm font-semibold leading-none">易</span>,
      children: yijingItems,
    },
  ];
}
