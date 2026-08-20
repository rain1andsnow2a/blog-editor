// 编辑器的通用 UI 小控件：气泡按钮、工具栏按钮、Turn Into 菜单项、颜色面板。
// 从 Editor.tsx 拆出，只依赖 editor 实例，不持有页面状态。
import { X } from 'lucide-react';
import { TEXT_COLORS, BG_COLORS } from '../../lib/editorConfig';

export function BubbleBtn({ children, active, onClick, title }: {
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

export function ToolBtn({ children, active, onClick, title }: {
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
export function CurrentBlockLabel({ editor }: { editor: any }) {
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
export function TurnIntoItem({ icon, label, desc, active, onClick }: {
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
export function NotionColorPanel({ editor, onClose }: { editor: any; onClose: () => void }) {
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
