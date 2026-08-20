// 代码块扩展：mermaid 语言实时渲染预览，mindmap 语言换成交互式画布。
// 从 Editor.tsx 拆出。
import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { X } from 'lucide-react';
import MindmapCanvas from '../components/MindmapCanvas';

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

/**
 * 思维导图代码块：界面上只出现交互式画布，围栏代码块退回「文件格式」的角色，
 * 折进「源码」开关里。画布的每次结构改动都写回代码块文本，Markdown 往返不变。
 */
function MindmapNodeView({ node, editor, getPos }: { node: any; editor: any; getPos: any }) {
  const [showSource, setShowSource] = useState(false);
  /** 专注编辑：门户到 body 的全屏页，改动同样实时写回代码块 */
  const [fullscreen, setFullscreen] = useState(false);
  const source = node.textContent || '';

  const applySource = useCallback(
    (next: string) => {
      if (typeof getPos !== 'function') return;
      const pos = getPos();
      if (typeof pos !== 'number') return;
      // 位置和长度都从最新的 state 里取，避免连续改动时用到过期的 nodeSize
      const current = editor.state.doc.nodeAt(pos);
      if (!current) return;
      const from = pos + 1;
      const to = pos + current.nodeSize - 1;

      // dispatch 会同步 DOM 选区，可能把焦点从画布里的输入框抢走，先记后补
      const active = document.activeElement as HTMLElement | null;
      const isField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      const selStart = isField ? (active as HTMLInputElement).selectionStart : null;
      const selEnd = isField ? (active as HTMLInputElement).selectionEnd : null;

      const tr = editor.state.tr;
      if (next) tr.replaceWith(from, to, editor.state.schema.text(next));
      else tr.delete(from, to);
      editor.view.dispatch(tr);

      if (active && active.isConnected && document.activeElement !== active) {
        active.focus({ preventScroll: true });
        if (isField && selStart != null) {
          (active as HTMLInputElement).setSelectionRange(selStart, selEnd ?? selStart);
        }
      }
    },
    [editor, getPos],
  );

  /** 删除整个思维导图块：从文档中移除这个代码块节点本身 */
  const deleteBlock = useCallback(() => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const current = editor.state.doc.nodeAt(pos);
    if (!current) return;
    editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
  }, [editor, getPos]);

  return (
    <NodeViewWrapper className="mindmap-code-block">
      {!fullscreen && (
        <MindmapCanvas
          source={source}
          onChange={applySource}
          sourceVisible={showSource}
          onToggleSource={() => setShowSource((v) => !v)}
          onDeleteBlock={deleteBlock}
          onEnterFullscreen={() => setFullscreen(true)}
        />
      )}
      {fullscreen &&
        createPortal(
          <div className="mmap-fullscreen">
            <div className="mmap-fullscreen__bar">
              <span className="mmap-fullscreen__title">思维导图 · 专注编辑</span>
              <span className="mmap-fullscreen__tip">改动实时写回文档 · 无选中时按 Esc 或点右侧按钮返回</span>
              <button type="button" className="mmap-fullscreen__close" onClick={() => setFullscreen(false)}>
                <X />
                返回文档
              </button>
            </div>
            <div className="mmap-fullscreen__body">
              <MindmapCanvas
                source={source}
                onChange={applySource}
                fullscreen
                onExitFullscreen={() => setFullscreen(false)}
              />
            </div>
          </div>,
          document.body,
        )}
      <div className={`mindmap-source${showSource ? '' : ' is-hidden'}`}>
        <pre>
          <NodeViewContent as="code" className="language-mindmap" />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}

function CodeBlockWithMermaidPreview(props: { node: any; editor: any; getPos: any }) {
  const { node } = props;
  const language = (node.attrs?.language || '').toLowerCase();
  const isMermaid = language === 'mermaid';

  if (language === 'mindmap') {
    return <MindmapNodeView {...props} />;
  }

  return (
    <NodeViewWrapper className={isMermaid ? 'mermaid-code-block' : 'code-block'}>
      <pre>
        <NodeViewContent as="code" className={language ? `language-${language}` : ''} />
      </pre>
      {isMermaid && <MermaidPreview code={node.textContent || ''} />}
    </NodeViewWrapper>
  );
}

export const CodeBlockWithMermaid = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockWithMermaidPreview, {
      /**
       * 思维导图画布要自己吃掉鼠标事件，否则 ProseMirror 会把点击当成
       * 「选中整个代码块」，抢走画布的键盘焦点，Tab/Enter 就落到文档上了。
       */
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (!target?.closest) return false;
        if (target.closest('.mindmap-source')) return false; // 源码区照旧交给编辑器
        return Boolean(target.closest('.mmap'));
      },
      /** 画布内部的 DOM 由 React 重绘，别让 ProseMirror 跟着读 DOM / 同步选区 */
      ignoreMutation: ({ mutation }) => {
        const node = mutation.target as Node | null;
        const el = (node && (node.nodeType === 1 ? node : node.parentElement)) as HTMLElement | null;
        if (!el?.closest) return false;
        if (el.closest('.mmap')) return true;
        return false;
      },
    });
  },
});
