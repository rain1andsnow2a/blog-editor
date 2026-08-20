// 斜杠命令弹窗（含易经符号扩展面板），纯展示组件，数据来自 useSlashMenu。
import { ChevronRight } from 'lucide-react';
import type { SlashItem, YijingGroup } from '../../lib/slashItems';

export function SlashMenuPopup({
  pos, items, activeIndex, submenuId, showYijingPanel, yijingGroups,
  onExecute, onHoverItem,
}: {
  pos: { top: number; left: number };
  items: SlashItem[];
  activeIndex: number;
  submenuId: string | null;
  showYijingPanel: boolean;
  yijingGroups: YijingGroup[];
  onExecute: (item: SlashItem) => void;
  onHoverItem: (index: number, item: SlashItem) => void;
}) {
  return (
    <div
      className="absolute z-50 flex items-start gap-2"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-notion-border py-2 w-72 max-h-80 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] text-notion-text-secondary uppercase tracking-wider">
          基础块
        </div>
        {items.map((item, idx) => {
          const isActive = idx === Math.min(activeIndex, items.length - 1);
          const isExpanded = submenuId === item.id || (isActive && !!item.children?.length);

          return (
            <button
              key={item.id}
              onClick={() => onExecute(item)}
              onMouseEnter={() => onHoverItem(idx, item)}
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
        {items.length === 0 && (
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
            {yijingGroups.map((group) => (
              <div key={group.id} className="min-w-0 rounded-lg border border-notion-border/70 overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-notion-text bg-notion-bg-hover/60 border-b border-notion-border">
                  {group.title}
                </div>
                <div className={`overflow-y-auto ${group.id === 'hexagrams' ? 'max-h-80' : 'max-h-64'}`}>
                  {group.items.length > 0 ? (
                    group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onExecute(item)}
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
  );
}
