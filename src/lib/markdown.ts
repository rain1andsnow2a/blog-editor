// Markdown ↔ TipTap HTML/JSON 转换的纯函数模块。
// 从 Editor.tsx 拆出，不依赖任何组件状态。

// --- Markdown paste detection & table parsing helpers ---
const TABLE_SEPARATOR_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

export function parsePipeRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

export function isTableStart(lines: string[], index: number): boolean {
  const line = lines[index];
  if (!line.trim().startsWith('|') || !line.includes('|', 1)) return false;
  const next = lines[index + 1];
  if (!next) return false;
  return TABLE_SEPARATOR_RE.test(next) && next.includes('-');
}

export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (isTableStart(lines, i)) return true;
  }
  let signals = 0;
  for (const line of lines) {
    const t = line.trim();
    if (/^#{1,6}\s+\S/.test(t)) signals += 2;
    else if (/^```/.test(t)) signals += 2;
    else if (/^[-*+]\s+\S/.test(t)) signals += 1;
    else if (/^\d+\.\s+\S/.test(t)) signals += 1;
    else if (/^>\s+\S/.test(t)) signals += 1;
    if (signals >= 2) return true;
  }
  return false;
}

// --- Math formula normalization ---
function stripWrappedFormula(value: string, open: string, close: string) {
  let next = value.trim();
  while (next.startsWith(open) && next.endsWith(close) && next.length >= open.length + close.length) {
    next = next.slice(open.length, next.length - close.length).trim();
  }
  return next;
}

export function normalizeMathFormula(value: string, type: 'block' | 'inline') {
  let formula = value.replace(/\u200B/g, '').trim();
  const pairs: Array<[string, string]> = type === 'block'
    ? [['$$', '$$'], ['\\[', '\\]'], ['$', '$'], ['\\(', '\\)']]
    : [['$$', '$$'], ['$', '$'], ['\\(', '\\)'], ['\\[', '\\]']];

  for (const [open, close] of pairs) {
    formula = stripWrappedFormula(formula, open, close);
  }

  return formula;
}

export const EMPTY_PARAGRAPH_MARKDOWN = '<p>&nbsp;</p>';
export const EMPTY_PARAGRAPH_HTML_RE = /^<p>(?:&nbsp;|\s|<br\s*\/?>)*<\/p>$/i;

// Inline formatting: bold, italic, code, links, images, strikethrough
export function inlineFormat(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (_m, f) => {
      const formula = normalizeMathFormula(f, 'inline');
      return `<span data-type="math-inline" formula="${formula.replace(/"/g, '&quot;')}"></span>`;
    })
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>');
}

// Convert markdown to HTML for TipTap (block-aware parser)
export function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Aligned block wrapper: <div style="text-align: center"> ... </div>
    const alignMatch = line.trim().match(/^<div style="text-align: (center|right|justify)">$/);
    if (alignMatch) {
      const align = alignMatch[1];
      const innerLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '</div>') {
        innerLines.push(lines[i]);
        i++;
      }
      i++; // skip closing </div>
      const innerHtml = markdownToHtml(innerLines.join('\n'));
      blocks.push(innerHtml.replace(/<(p|h[1-6])(?=[\s>])/g, `<$1 style="text-align: ${align}"`));
      continue;
    }

    // Math block ($$...$$)
    if (line.trim() === '$$') {
      const mathLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '$$') {
        mathLines.push(lines[i]);
        i++;
      }
      i++; // skip closing $$
      const formula = normalizeMathFormula(mathLines.join('\n'), 'block');
      blocks.push(`<div data-type="math-block" formula="${formula.replace(/"/g, '&quot;')}"></div>`);
      continue;
    }

    // Code block (fenced)
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const escaped = codeLines.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      blocks.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`);
      continue;
    }

    // Pipe table (GFM: header row + separator row + body rows)
    if (isTableStart(lines, i)) {
      const headerCells = parsePipeRow(line);
      i += 2; // skip header row and separator row
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        bodyRows.push(parsePipeRow(lines[i]));
        i++;
      }
      const colCount = headerCells.length;
      const headHtml = headerCells.map((c) => `<th>${inlineFormat(c)}</th>`).join('');
      const bodyHtml = bodyRows
        .map((row) => {
          const cells = Array.from(
            { length: colCount },
            (_, idx) => `<td>${inlineFormat(row[idx] || '')}</td>`
          ).join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      blocks.push(`<table><tr>${headHtml}</tr>${bodyHtml}</table>`);
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      blocks.push('<hr>');
      i++;
      continue;
    }

    // Blockquote (collect consecutive > lines)
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(`<blockquote><p>${inlineFormat(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push('<ul>' + items.map(it => `<li><p>${inlineFormat(it)}</p></li>`).join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const startMatch = line.match(/^(\d+)\.\s+/);
      const start = startMatch ? parseInt(startMatch[1], 10) : 1;
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      const startAttr = start !== 1 ? ` start="${start}"` : '';
      blocks.push(`<ol${startAttr}>` + items.map(it => `<li><p>${inlineFormat(it)}</p></li>`).join('') + '</ol>');
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Explicit blank paragraph marker emitted by this editor.
    if (EMPTY_PARAGRAPH_HTML_RE.test(line.trim())) {
      blocks.push('<p></p>');
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      lines[i].trim() !== '$$' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p>${inlineFormat(paraLines.join(' '))}</p>`);
    } else {
      // Prevent unsupported block syntax from trapping the parser on the same line.
      blocks.push(`<p>${inlineFormat(line)}</p>`);
      i++;
    }
  }

  return blocks.join('');
}

// Convert editor JSON to markdown directly (bypasses HTML serialization
// which corrupts atom nodes like math).
export function editorJsonToMarkdown(json: any): string {
  if (!json?.content) return '';

  // Serialize inline content (text, marks, inline nodes) to markdown string
  function inlineToMd(nodes: any[]): string {
    return nodes.map((n: any) => {
      if (n.type === 'mathInline') return `$${normalizeMathFormula(n.attrs?.formula || '', 'inline')}$`;
      if (n.type === 'image') return `![${n.attrs?.alt || ''}](${n.attrs?.src || ''})`;
      if (n.type === 'hardBreak') return '\n';
      if (n.type !== 'text') return '';
      let t: string = n.text || '';
      const marks: any[] = n.marks || [];
      // Apply marks inside-out
      for (const m of marks) {
        if (m.type === 'code') { t = `\`${t}\``; continue; }
        if (m.type === 'bold') t = `**${t}**`;
        if (m.type === 'italic') t = `*${t}*`;
        if (m.type === 'underline') t = `<u>${t}</u>`;
        if (m.type === 'strike') t = `~~${t}~~`;
        if (m.type === 'link') t = `[${t}](${m.attrs?.href || ''})`;
      }
      return t;
    }).join('');
  }

  // Wrap aligned blocks in an HTML container so alignment survives the
  // markdown round-trip (blank lines keep inner markdown parseable by remark).
  function wrapAligned(md: string, align?: string): string {
    if (!align || align === 'left') return md;
    return `<div style="text-align: ${align}">\n\n${md}\n\n</div>`;
  }

  function blockToMd(node: any): string {
    const children = node.content || [];
    switch (node.type) {
      case 'paragraph': {
        const md = children.length > 0 ? inlineToMd(children) : EMPTY_PARAGRAPH_MARKDOWN;
        return wrapAligned(md, node.attrs?.textAlign);
      }
      case 'heading': {
        const level = node.attrs?.level || 1;
        const md = '#'.repeat(level) + ' ' + inlineToMd(children);
        return wrapAligned(md, node.attrs?.textAlign);
      }
      case 'mathBlock':
        return `$$\n${normalizeMathFormula(node.attrs?.formula || '', 'block')}\n$$`;
      case 'codeBlock': {
        const lang = node.attrs?.language || '';
        const code = children.map((c: any) => c.text || '').join('');
        return '```' + lang + '\n' + code + '\n```';
      }
      case 'blockquote':
        return children.map((c: any) => blockToMd(c)).map((l: string) =>
          l.split('\n').map((s: string) => `> ${s}`).join('\n')
        ).join('\n');
      case 'bulletList':
        return children.map((li: any) => {
          const inner = (li.content || []).map((c: any) => blockToMd(c)).join('\n');
          return `- ${inner}`;
        }).join('\n');
      case 'orderedList': {
        const start = node.attrs?.start || 1;
        return children.map((li: any, idx: number) => {
          const inner = (li.content || []).map((c: any) => blockToMd(c)).join('\n');
          return `${start + idx}. ${inner}`;
        }).join('\n');
      }
      case 'taskList':
        return children.map((li: any) => {
          const checked = li.attrs?.checked ? 'x' : ' ';
          const inner = (li.content || []).map((c: any) => blockToMd(c)).join('\n');
          return `- [${checked}] ${inner}`;
        }).join('\n');
      case 'horizontalRule':
        return '---';
      case 'image':
        return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})`;
      case 'table': {
        const rows = children.filter((r: any) => r.type === 'tableRow');
        if (rows.length === 0) return '';
        const toRow = (row: any) =>
          '| ' + (row.content || []).map((cell: any) =>
            (cell.content || []).map((c: any) => blockToMd(c)).join(' ')
          ).join(' | ') + ' |';
        const lines = [toRow(rows[0])];
        const colCount = (rows[0].content || []).length;
        lines.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');
        for (let r = 1; r < rows.length; r++) lines.push(toRow(rows[r]));
        return lines.join('\n');
      }
      case 'listItem':
      case 'taskItem':
        return (node.content || []).map((c: any) => blockToMd(c)).join('\n');
      default:
        // For unknown nodes with content, recurse
        if (children.length > 0) return children.map((c: any) => blockToMd(c)).join('\n');
        return '';
    }
  }

  // Filter out empty paragraphs that are adjacent to image blocks
  // (TipTap auto-inserts them around images; they accumulate on each save/reload)
  const blocks = json.content;
  const mdBlocks: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isEmptyPara = block.type === 'paragraph' && (!block.content || block.content.length === 0);
    if (isEmptyPara) {
      const prevIsImage = i > 0 && blocks[i - 1].type === 'image';
      const nextIsImage = i < blocks.length - 1 && blocks[i + 1].type === 'image';
      if (prevIsImage || nextIsImage) continue; // skip empty paragraphs next to images
    }
    mdBlocks.push(blockToMd(block));
  }

  return mdBlocks.join('\n\n');
}
