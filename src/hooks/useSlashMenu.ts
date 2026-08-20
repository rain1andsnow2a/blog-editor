// 斜杠菜单的完整逻辑：状态、键盘处理、过滤、执行、中文输入法同步。
// Editor.tsx 只需要把 handleKeyDown 挂进 editorProps，再把渲染数据交给 SlashMenuPopup。
import { useState, useRef, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import type { SlashItem, YijingGroup } from '../lib/slashItems';

export function useSlashMenu({ editor, items, yijingGroups }: {
  editor: Editor | null;
  items: SlashItem[];
  yijingGroups: YijingGroup[];
}) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashSubmenuId, setSlashSubmenuId] = useState<string | null>(null);
  const slashPos = useRef<{ top: number; left: number } | null>(null);
  const slashFromPos = useRef<number>(0);
  const slashFilterRef = useRef('');

  // editorProps 的回调在渲染前就已创建，用 ref 拿最新的 editor 实例
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  const close = useCallback(() => {
    setSlashOpen(false);
    setSlashSubmenuId(null);
  }, []);

  /** 挂到 editorProps.handleKeyDown。返回 true 表示事件已被菜单消费。 */
  const handleKeyDown = (event: KeyboardEvent): boolean => {
    // Open slash menu on '/'
    if (event.key === '/' && !slashOpen && !event.ctrlKey && !event.metaKey) {
      // Defer so the '/' character is inserted first
      setTimeout(() => {
        const ed = editorRef.current;
        if (!ed) return;
        const { from } = ed.state.selection;
        // Get cursor position for popup
        const coords = ed.view.coordsAtPos(from);
        const editorRect = ed.view.dom.getBoundingClientRect();
        slashPos.current = {
          top: coords.bottom - editorRect.top + 4,
          left: coords.left - editorRect.left,
        };
        slashFromPos.current = from - 1; // position of the '/'
        setSlashFilter('');
        slashFilterRef.current = '';
        setSlashIndex(0);
        setSlashSubmenuId(null);
        setSlashOpen(true);
      }, 0);
      return false;
    }

    // Handle keys when slash menu is open
    if (slashOpen) {
      if (event.key === 'Escape') {
        close();
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
          const ed = editorRef.current;
          if (!ed) return;
          const { from } = ed.state.selection;
          const text = ed.state.doc.textBetween(slashFromPos.current, from);
          if (!text.startsWith('/')) {
            close();
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
          const ed = editorRef.current;
          if (!ed) return;
          const { from } = ed.state.selection;
          const text = ed.state.doc.textBetween(slashFromPos.current, from);
          if (text.startsWith('/')) {
            setSlashFilter(text.slice(1));
            setSlashIndex(0);
            setSlashSubmenuId(null);
          } else {
            close();
          }
        }, 0);
        return false;
      }
    }

    return false;
  };

  const filteredItems = items.filter(item =>
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

  const activeItem = filteredItems[Math.min(slashIndex, filteredItems.length - 1)];
  const showYijingPanel =
    slashSubmenuId === 'yijing-symbols' ||
    (activeItem?.id === 'yijing-symbols' && !!activeItem.children?.length);
  const normalizedFilter = slashFilter.trim().toLowerCase();
  const visibleYijingGroups = yijingGroups.map((group) => ({
    ...group,
    items: normalizedFilter
      ? group.items.filter((item) =>
          item.label.toLowerCase().includes(normalizedFilter) ||
          item.id.toLowerCase().includes(normalizedFilter) ||
          item.desc.toLowerCase().includes(normalizedFilter)
        )
      : group.items,
  }));

  // Execute slash command — delete the /query text, then run the action
  const executeSlashCommand = useCallback((item: SlashItem) => {
    const ed = editorRef.current;
    if (!ed) return;
    if (item.children?.length) {
      setSlashSubmenuId(item.id);
      return;
    }
    setSlashOpen(false);
    setSlashSubmenuId(null);
    // Delete the slash and any filter text
    const { from } = ed.state.selection;
    ed.chain().focus()
      .deleteRange({ from: slashFromPos.current, to: from })
      .run();
    item.action?.();
  }, []);

  // Listen for slash-execute custom event (from Enter keypress)
  useEffect(() => {
    const handler = () => {
      const idx = Math.min(slashIndex, filteredItems.length - 1);
      if (filteredItems[idx]) executeSlashCommand(filteredItems[idx]);
    };
    document.addEventListener('slash-execute', handler);
    return () => document.removeEventListener('slash-execute', handler);
  }, [filteredItems, slashIndex, executeSlashCommand]);

  // 斜杠菜单的过滤词从文档内容同步，而不是只依赖 keydown。
  // 中文经输入法提交时 keydown 的 event.key 是 'Process'，长度不为 1，
  // 走不到上面那条 keydown 分支，所以 /思维 这种中文筛选原本是失效的。
  useEffect(() => {
    if (!editor || !slashOpen) return;

    const sync = () => {
      const { from } = editor.state.selection;
      if (from <= slashFromPos.current) {
        close();
        return;
      }
      const text = editor.state.doc.textBetween(slashFromPos.current, from, '\n', '\n');
      if (!text.startsWith('/')) {
        close();
        return;
      }
      const next = text.slice(1);
      // 只在过滤词真的变了时才重置高亮项，否则会和方向键选择打架
      if (slashFilterRef.current === next) return;
      slashFilterRef.current = next;
      setSlashFilter(next);
      setSlashIndex(0);
      setSlashSubmenuId(null);
    };

    editor.on('update', sync);
    return () => {
      editor.off('update', sync);
    };
  }, [editor, slashOpen, close]);

  return {
    slashOpen,
    slashIndex,
    slashSubmenuId,
    slashPos,
    filteredItems,
    showYijingPanel,
    visibleYijingGroups,
    handleKeyDown,
    executeSlashCommand,
    setSlashIndex,
    setSlashSubmenuId,
  };
}
