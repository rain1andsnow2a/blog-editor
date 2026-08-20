// 方案 D「彩谱」的左侧文档大纲侧栏。
// 自行订阅 editor 更新；大纲没变化时跳过 setState，避免每次按键都重渲染。
import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

type OutlineItem = { level: number; text: string; pos: number };

function collectOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.textContent.trim()) {
      items.push({ level: node.attrs.level, text: node.textContent, pos });
    }
    return node.type.name !== 'heading';
  });
  return items;
}

function sameOutline(a: OutlineItem[], b: OutlineItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => (
    item.level === b[i].level && item.text === b[i].text && item.pos === b[i].pos
  ));
}

/** 左栏：文档大纲，点击跳转到对应标题 */
export function OutlinePanel({ editor }: { editor: Editor }) {
  const [outline, setOutline] = useState<OutlineItem[]>(() => collectOutline(editor));

  useEffect(() => {
    const sync = () => {
      const next = collectOutline(editor);
      setOutline((prev) => (sameOutline(prev, next) ? prev : next));
    };
    sync();
    editor.on('update', sync);
    return () => {
      editor.off('update', sync);
    };
  }, [editor]);

  const jumpTo = (pos: number) => {
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    editor.chain().focus().setTextSelection(pos + 1).run();
  };

  return (
    <aside className="hidden xl:block w-[220px] shrink-0 sticky top-[52px] self-start max-h-[calc(100vh-52px)] overflow-y-auto py-7 pl-5 pr-3">
      <h4 className="text-[11px] uppercase tracking-[0.08em] text-notion-text-placeholder font-semibold mb-3">
        大纲
      </h4>
      {outline.length === 0 && (
        <p className="text-xs text-notion-text-placeholder leading-relaxed">
          输入标题后，这里会显示文档结构
        </p>
      )}
      <nav className="space-y-0.5">
        {outline.map((item, i) => (
          <button
            key={`${item.pos}-${i}`}
            onClick={() => jumpTo(item.pos)}
            className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-left text-[13px] text-notion-text-secondary hover:bg-notion-bg-hover hover:text-notion-text transition-colors"
            style={{ paddingLeft: 8 + (item.level - 1) * 14 }}
            title={item.text}
          >
            {item.level === 1 && <span className="w-[3px] h-3.5 rounded-sm bg-notion-accent shrink-0" />}
            <span className="truncate">{item.text}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
