// LaTeX 公式输入弹窗。打开时自动聚焦，Ctrl+Enter 提交，Esc 关闭。
import { useEffect, useRef } from 'react';

export function MathDialog({ type, formula, onFormulaChange, onSubmit, onClose }: {
  type: 'block' | 'inline';
  formula: string;
  onFormulaChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-notion-border w-[520px] max-w-[90vw] p-6">
        <h3 className="text-lg font-semibold text-notion-text mb-1">
          {type === 'block' ? '插入公式块' : '插入行内公式'}
        </h3>
        <p className="text-sm text-notion-text-secondary mb-4">
          输入 LaTeX 公式
        </p>
        <textarea
          ref={inputRef}
          value={formula}
          onChange={(e) => onFormulaChange(e.target.value)}
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSubmit();
            }
            if (e.key === 'Escape') onClose();
          }}
          placeholder={type === 'block' ? 'E = mc^2' : 'x^2 + y^2'}
          className="w-full h-24 p-3 border border-notion-border rounded-lg bg-notion-bg text-notion-text font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-notion-accent/30 focus:border-notion-accent"
        />
        {formula.trim() && (
          <div className="mt-3 p-3 bg-notion-bg-hover rounded-lg border border-notion-border/50 text-center min-h-[40px] flex items-center justify-center">
            <span className="text-sm text-notion-text-secondary italic">预览需要在编辑器中查看</span>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-notion-text-secondary hover:text-notion-text hover:bg-notion-bg-hover rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={!formula.trim()}
            className="px-4 py-2 text-sm bg-notion-accent text-white rounded-lg hover:bg-notion-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            确定 <span className="text-[10px] opacity-60 ml-1">Ctrl+Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
