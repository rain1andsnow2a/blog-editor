import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// --- Math Block ($$...$$) ---
const MathBlockComponent = ({ node, updateAttributes, selected }: any) => {
  const formula = node.attrs.formula || '';
  let html = '';
  let error = '';

  try {
    html = katex.renderToString(formula, {
      displayMode: true,
      throwOnError: false,
      trust: true,
    });
  } catch (e: any) {
    error = e.message;
  }

  return (
    <NodeViewWrapper className={`math-block-wrapper my-4 ${selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
      <div
        className="math-block-render bg-gray-50 rounded-lg p-4 text-center cursor-pointer border border-transparent hover:border-gray-200 transition-colors"
        contentEditable={false}
      >
        {formula ? (
          error ? (
            <span className="text-red-500 text-sm font-mono">{error}</span>
          ) : (
            <span dangerouslySetInnerHTML={{ __html: html }} />
          )
        ) : (
          <span className="text-gray-400 text-sm italic">点击编辑公式...</span>
        )}
      </div>
      <div className="mt-2">
        <textarea
          className="w-full px-3 py-2 text-sm font-mono bg-white border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 resize-none"
          value={formula}
          onChange={(e) => updateAttributes({ formula: e.target.value })}
          placeholder="输入 LaTeX 公式，如：\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"
          rows={2}
        />
      </div>
    </NodeViewWrapper>
  );
};

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      formula: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockComponent);
  },

  addCommands() {
    return {
      insertMathBlock:
        (attrs?: { formula?: string }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { formula: attrs?.formula || '' },
          });
        },
    } as any;
  },
});

// --- Math Inline ($...$) ---
const MathInlineComponent = ({ node, updateAttributes, selected }: any) => {
  const formula = node.attrs.formula || '';
  let html = '';

  try {
    html = katex.renderToString(formula, {
      displayMode: false,
      throwOnError: false,
      trust: true,
    });
  } catch {
    html = `<span style="color:red">${formula}</span>`;
  }

  return (
    <NodeViewWrapper as="span" className={`math-inline ${selected ? 'bg-blue-50 rounded' : ''}`}>
      {formula ? (
        <span dangerouslySetInnerHTML={{ __html: html }} contentEditable={false} />
      ) : (
        <span className="text-gray-400 text-xs italic" contentEditable={false}>$...$</span>
      )}
    </NodeViewWrapper>
  );
};

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      formula: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineComponent);
  },

  addCommands() {
    return {
      insertMathInline:
        (attrs?: { formula?: string }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { formula: attrs?.formula || '' },
          });
        },
    } as any;
  },
});
