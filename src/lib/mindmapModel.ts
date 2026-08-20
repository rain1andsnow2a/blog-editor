/**
 * 思维导图数据模型 · 源码 ⇄ 树
 * ---------------------------------------------------------------------------
 * 源码依然是围栏代码块 ```mindmap 里的缩进列表 —— 这是存进 Markdown、
 * 被博客读取的唯一格式。编辑器只是把它当成「文件格式」，界面上不再直接暴露。
 *
 *   中心主题
 *     第一条分支 {#metric p1 60% note="先看火焰图"}
 *       要点一
 *   ---
 *   rel metric -> other : 相关
 *   boundary metric : 第一阶段
 *   summary metric : 汇总
 *
 * 兼容性约定（重要）：
 *   - 行尾 {…} 只有在「每个 token 都认识」时才当元数据，否则整段留在标签里，
 *     所以历史上写过 `foo {bar}` 的图不会被吃掉字。
 *   - `---` 之后是指令区，放不属于树的东西（联系线 / 外框 / 概要）。
 *   - 解析永不抛异常：缩进乱了也要给出一棵能编辑的树，交互式编辑器里
 *     报错框比容错更让人恼火。
 */

export type MindNode = {
  id: string;
  label: string;
  children: MindNode[];
  /** 折叠 = 暂时把子问题移出视野，状态要能存进源码 */
  collapsed?: boolean;
  /** 点开才显示的长文本，主干保持简洁 */
  note?: string;
  link?: string;
  image?: string;
  /** 1–7，1 最紧急 */
  priority?: number;
  /** 0–100 */
  progress?: number;
  flag?: MindFlag;
};

export const MIND_FLAGS = ['flag', 'star', 'check', 'question', 'idea', 'warn'] as const;
export type MindFlag = (typeof MIND_FLAGS)[number];

/** 树里唯一允许的「非树边」：跨分支的虚线箭头 */
export type MindRelation = { id: string; from: string; to: string; label?: string };
/** 把一棵子树圈成一组 */
export type MindBoundary = { id: string; target: string; label?: string };
/** 一个大括号汇总某棵子树 */
export type MindSummary = { id: string; target: string; label: string };

export type MindDoc = {
  root: MindNode;
  relations: MindRelation[];
  boundaries: MindBoundary[];
  summaries: MindSummary[];
};

export const DEFAULT_ROOT_LABEL = '中心主题';

/* ── 解析 ──────────────────────────────────────────────────────────────── */

type RawRow = { indent: number; label: string; meta: NodeMeta };
type NodeMeta = Partial<Pick<MindNode, 'collapsed' | 'note' | 'link' | 'image' | 'priority' | 'progress' | 'flag'>> & {
  id?: string;
};

const DIRECTIVE_SPLIT = /^\s*---+\s*$/;

export function parseMindmapDoc(source: string): MindDoc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  // 先切出指令区
  let splitAt = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (DIRECTIVE_SPLIT.test(lines[i])) {
      splitAt = i;
      break;
    }
  }
  const treeLines = lines.slice(0, splitAt);
  const directiveLines = lines.slice(Math.min(splitAt + 1, lines.length));

  const rows: RawRow[] = [];
  treeLines.forEach((rawLine) => {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim()) return;
    const indent = line.length - line.trimStart().length;
    const body = line.trim().replace(/^[-*+]\s+/, '');
    const { label, meta } = splitMeta(body);
    if (!label && !Object.keys(meta).length) return;
    rows.push({ indent, label, meta });
  });

  const taken = new Set<string>();
  rows.forEach((row) => {
    if (row.meta.id) taken.add(row.meta.id);
  });
  let autoSeq = 0;
  const nextId = () => {
    for (;;) {
      autoSeq += 1;
      const candidate = `n${autoSeq}`;
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
  };
  const makeNode = (label: string, meta: NodeMeta): MindNode => ({
    id: meta.id || nextId(),
    label,
    children: [],
    ...stripId(meta),
  });

  if (!rows.length) {
    return { root: makeNode(DEFAULT_ROOT_LABEL, {}), relations: [], boundaries: [], summaries: [] };
  }

  const root = makeNode(rows[0].label || DEFAULT_ROOT_LABEL, rows[0].meta);
  const stack: { indent: number; node: MindNode }[] = [{ indent: rows[0].indent, node: root }];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const node = makeNode(row.label, row.meta);
    // 容错：第二个零缩进行不再是「第二个中心主题」，直接挂成 root 的孩子
    const indent = row.indent <= stack[0].indent ? stack[0].indent + 2 : row.indent;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent, node });
  }

  const ids = new Set<string>();
  walk(root, (n) => ids.add(n.id));

  const relations: MindRelation[] = [];
  const boundaries: MindBoundary[] = [];
  const summaries: MindSummary[] = [];
  let decoSeq = 0;
  const decoId = (prefix: string) => {
    decoSeq += 1;
    return `${prefix}${decoSeq}`;
  };

  directiveLines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    let m = /^rel\s+(\S+)\s*->\s*([^:]+?)\s*(?::\s*(.*))?$/.exec(line);
    if (m && ids.has(m[1]) && ids.has(m[2].trim())) {
      relations.push({ id: decoId('r'), from: m[1], to: m[2].trim(), label: unquote(m[3]) });
      return;
    }
    m = /^boundary\s+([^:]+?)\s*(?::\s*(.*))?$/.exec(line);
    if (m && ids.has(m[1].trim())) {
      boundaries.push({ id: decoId('b'), target: m[1].trim(), label: unquote(m[2]) });
      return;
    }
    m = /^summary\s+([^:]+?)\s*(?::\s*(.*))?$/.exec(line);
    if (m && ids.has(m[1].trim())) {
      summaries.push({ id: decoId('s'), target: m[1].trim(), label: unquote(m[2]) || '概要' });
    }
  });

  return { root, relations, boundaries, summaries };
}

function stripId(meta: NodeMeta) {
  const { id, ...rest } = meta;
  void id;
  return rest;
}

function unquote(value?: string): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/** 行尾 {…}：全部 token 都认识才算元数据，否则原样留在标签里 */
function splitMeta(body: string): { label: string; meta: NodeMeta } {
  const m = /^(.*?)\s*\{([^{}]*)\}$/.exec(body);
  if (!m) return { label: body, meta: {} };

  const tokens = tokenize(m[2]);
  if (!tokens) return { label: body, meta: {} };

  const meta: NodeMeta = {};
  for (const token of tokens) {
    if (/^#[^\s]+$/.test(token)) {
      meta.id = token.slice(1);
      continue;
    }
    if (/^p[1-7]$/.test(token)) {
      meta.priority = Number(token.slice(1));
      continue;
    }
    if (/^\d{1,3}%$/.test(token)) {
      meta.progress = Math.min(100, Number(token.slice(0, -1)));
      continue;
    }
    if (token === 'collapsed') {
      meta.collapsed = true;
      continue;
    }
    const kv = /^(note|link|img|flag)=([\s\S]*)$/.exec(token);
    if (kv) {
      const value = decodeValue(kv[2]);
      if (kv[1] === 'note') meta.note = value;
      else if (kv[1] === 'link') meta.link = value;
      else if (kv[1] === 'img') meta.image = value;
      else if ((MIND_FLAGS as readonly string[]).includes(value)) meta.flag = value as MindFlag;
      else return { label: body, meta: {} };
      continue;
    }
    // 认不出来 → 整段当普通文字
    return { label: body, meta: {} };
  }

  return { label: m[1], meta };
}

/** 按空格切 token，双引号内的空格保留；引号不闭合返回 null（视为普通文字） */
function tokenize(input: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let escaped = false;
  let hasContent = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (escaped) {
      cur += ch === 'n' ? '\n' : ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quoted) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      hasContent = true;
      cur += ch;
      continue;
    }
    if (!quoted && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
    hasContent = true;
  }
  if (quoted || escaped) return null;
  if (cur) out.push(cur);
  if (!out.length && hasContent) return null;
  return out;
}

function decodeValue(raw: string): string {
  if (raw.startsWith('"')) {
    const inner = raw.endsWith('"') ? raw.slice(1, -1) : raw.slice(1);
    return inner.replace(/\\(.)/g, (_all, ch) => (ch === 'n' ? '\n' : ch));
  }
  return raw;
}

/* ── 序列化 ───────────────────────────────────────────────────────────── */

export function serializeMindmapDoc(doc: MindDoc): string {
  const referenced = new Set<string>();
  doc.relations.forEach((r) => {
    referenced.add(r.from);
    referenced.add(r.to);
  });
  doc.boundaries.forEach((b) => referenced.add(b.target));
  doc.summaries.forEach((s) => referenced.add(s.target));

  const lines: string[] = [];
  const emit = (node: MindNode, depth: number) => {
    const meta = metaTokens(node, referenced.has(node.id));
    const label = node.label.replace(/\s+$/, '');
    // 标签本身长得像元数据时补一个空 {}，读回来才不会被吃掉字
    const needsGuard = !meta.length && splitMeta(label).label !== label;
    const suffix = meta.length ? ` {${meta.join(' ')}}` : needsGuard ? ' {}' : '';
    lines.push(`${'  '.repeat(depth)}${label}${suffix}`);
    node.children.forEach((child) => emit(child, depth + 1));
  };
  emit(doc.root, 0);

  const directives: string[] = [];
  doc.boundaries.forEach((b) => directives.push(`boundary ${b.target}${b.label ? ` : ${b.label}` : ''}`));
  doc.summaries.forEach((s) => directives.push(`summary ${s.target} : ${s.label || '概要'}`));
  doc.relations.forEach((r) => directives.push(`rel ${r.from} -> ${r.to}${r.label ? ` : ${r.label}` : ''}`));

  if (directives.length) {
    lines.push('---');
    directives.forEach((d) => lines.push(d));
  }

  return lines.join('\n');
}

function metaTokens(node: MindNode, withId: boolean): string[] {
  const out: string[] = [];
  if (withId) out.push(`#${node.id}`);
  if (node.priority) out.push(`p${node.priority}`);
  if (typeof node.progress === 'number') out.push(`${node.progress}%`);
  if (node.flag) out.push(`flag=${node.flag}`);
  if (node.collapsed && node.children.length) out.push('collapsed');
  if (node.link) out.push(`link=${quoteIfNeeded(node.link)}`);
  if (node.image) out.push(`img=${quoteIfNeeded(node.image)}`);
  if (node.note) out.push(`note=${quoteIfNeeded(node.note, true)}`);
  return out;
}

function quoteIfNeeded(value: string, always = false): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  if (!always && /^[^\s"{}]+$/.test(value)) return escaped;
  return `"${escaped}"`;
}

/* ── 遍历与查找 ───────────────────────────────────────────────────────── */

export function walk(node: MindNode, visit: (node: MindNode, parent?: MindNode) => void, parent?: MindNode): void {
  visit(node, parent);
  node.children.forEach((child) => walk(child, visit, node));
}

export function findNode(doc: MindDoc, id: string): MindNode | undefined {
  let found: MindNode | undefined;
  walk(doc.root, (n) => {
    if (!found && n.id === id) found = n;
  });
  return found;
}

export function findParent(doc: MindDoc, id: string): MindNode | undefined {
  let found: MindNode | undefined;
  walk(doc.root, (n, parent) => {
    if (!found && n.id === id) found = parent;
  });
  return found;
}

export function subtreeIds(node: MindNode): string[] {
  const out: string[] = [];
  walk(node, (n) => out.push(n.id));
  return out;
}

/** 展开状态下从上到下的可见顺序，方向键导航用 */
export function visibleOrder(doc: MindDoc): string[] {
  const out: string[] = [];
  const visit = (node: MindNode) => {
    out.push(node.id);
    if (!node.collapsed) node.children.forEach(visit);
  };
  visit(doc.root);
  return out;
}

export function cloneDoc(doc: MindDoc): MindDoc {
  return {
    root: cloneNode(doc.root),
    relations: doc.relations.map((r) => ({ ...r })),
    boundaries: doc.boundaries.map((b) => ({ ...b })),
    summaries: doc.summaries.map((s) => ({ ...s })),
  };
}

function cloneNode(node: MindNode): MindNode {
  return { ...node, children: node.children.map(cloneNode) };
}

/* ── 树操作：全部返回新 doc，配合 React 状态 ─────────────────────────── */

let idSeq = 0;
function freshId(doc: MindDoc): string {
  const used = new Set<string>();
  walk(doc.root, (n) => used.add(n.id));
  for (;;) {
    idSeq += 1;
    const candidate = `k${idSeq}`;
    if (!used.has(candidate)) return candidate;
  }
}

export type EditResult = { doc: MindDoc; selectId: string };

export function addChild(doc: MindDoc, parentId: string, label = ''): EditResult {
  const next = cloneDoc(doc);
  const parent = findNode(next, parentId);
  if (!parent) return { doc, selectId: parentId };
  const node: MindNode = { id: freshId(next), label, children: [] };
  parent.collapsed = false;
  parent.children.push(node);
  return { doc: next, selectId: node.id };
}

export function addSibling(doc: MindDoc, refId: string, label = '', before = false): EditResult {
  if (refId === doc.root.id) return addChild(doc, refId, label);
  const next = cloneDoc(doc);
  const parent = findParent(next, refId);
  if (!parent) return { doc, selectId: refId };
  const index = parent.children.findIndex((c) => c.id === refId);
  const node: MindNode = { id: freshId(next), label, children: [] };
  parent.children.splice(before ? index : index + 1, 0, node);
  return { doc: next, selectId: node.id };
}

/** 删除节点会把整个子树一起带走，连同挂在子树上的装饰 */
export function removeNode(doc: MindDoc, id: string): EditResult {
  if (id === doc.root.id) return { doc, selectId: id };
  const next = cloneDoc(doc);
  const parent = findParent(next, id);
  const target = findNode(next, id);
  if (!parent || !target) return { doc, selectId: id };

  const gone = new Set(subtreeIds(target));
  const index = parent.children.findIndex((c) => c.id === id);
  parent.children.splice(index, 1);
  next.relations = next.relations.filter((r) => !gone.has(r.from) && !gone.has(r.to));
  next.boundaries = next.boundaries.filter((b) => !gone.has(b.target));
  next.summaries = next.summaries.filter((s) => !gone.has(s.target));

  const sibling = parent.children[index] || parent.children[index - 1];
  return { doc: next, selectId: sibling ? sibling.id : parent.id };
}

export function updateNode(doc: MindDoc, id: string, patch: Partial<Omit<MindNode, 'id' | 'children'>>): MindDoc {
  const next = cloneDoc(doc);
  const node = findNode(next, id);
  if (!node) return doc;
  Object.assign(node, patch);
  (Object.keys(patch) as (keyof MindNode)[]).forEach((key) => {
    const value = (patch as any)[key];
    if (value === undefined || value === '' || value === null) delete (node as any)[key];
  });
  return next;
}

export function toggleCollapse(doc: MindDoc, id: string, force?: boolean): MindDoc {
  const next = cloneDoc(doc);
  const node = findNode(next, id);
  if (!node || !node.children.length) return doc;
  const collapsed = force ?? !node.collapsed;
  if (collapsed) node.collapsed = true;
  else delete node.collapsed;
  return next;
}

export type MoveMode = 'child' | 'before' | 'after';

/** 重新挂载子树：dragId 带着全部子孙改换门庭，或在兄弟之间换位置 */
export function moveNode(doc: MindDoc, dragId: string, targetId: string, mode: MoveMode): MindDoc {
  if (dragId === targetId || dragId === doc.root.id) return doc;
  const next = cloneDoc(doc);
  const drag = findNode(next, dragId);
  const target = findNode(next, targetId);
  if (!drag || !target) return doc;
  // 不能把自己挂到自己的子孙下面，否则树会断成环
  if (subtreeIds(drag).includes(targetId)) return doc;
  if (mode !== 'child' && targetId === next.root.id) return doc;

  const oldParent = findParent(next, dragId);
  if (!oldParent) return doc;
  oldParent.children.splice(
    oldParent.children.findIndex((c) => c.id === dragId),
    1,
  );

  if (mode === 'child') {
    target.collapsed = false;
    target.children.push(drag);
  } else {
    const parent = findParent(next, targetId);
    if (!parent) return doc;
    const index = parent.children.findIndex((c) => c.id === targetId);
    parent.children.splice(mode === 'before' ? index : index + 1, 0, drag);
  }
  return next;
}

/** 同级上下移动 */
export function shiftNode(doc: MindDoc, id: string, delta: -1 | 1): MindDoc {
  const next = cloneDoc(doc);
  const parent = findParent(next, id);
  if (!parent) return doc;
  const index = parent.children.findIndex((c) => c.id === id);
  const to = index + delta;
  if (to < 0 || to >= parent.children.length) return doc;
  const [node] = parent.children.splice(index, 1);
  parent.children.splice(to, 0, node);
  return next;
}

/** 降级：挂到上一个兄弟下面 */
export function indentNode(doc: MindDoc, id: string): MindDoc {
  const parent = findParent(doc, id);
  if (!parent) return doc;
  const index = parent.children.findIndex((c) => c.id === id);
  if (index <= 0) return doc;
  return moveNode(doc, id, parent.children[index - 1].id, 'child');
}

/** 升级：变成父节点的下一个兄弟 */
export function outdentNode(doc: MindDoc, id: string): MindDoc {
  const parent = findParent(doc, id);
  if (!parent || parent.id === doc.root.id) return doc;
  return moveNode(doc, id, parent.id, 'after');
}

/* ── 装饰 ─────────────────────────────────────────────────────────────── */

function decoId(doc: MindDoc, prefix: string): string {
  const used = new Set([
    ...doc.relations.map((r) => r.id),
    ...doc.boundaries.map((b) => b.id),
    ...doc.summaries.map((s) => s.id),
  ]);
  let i = 1;
  for (;;) {
    const candidate = `${prefix}${i}`;
    if (!used.has(candidate)) return candidate;
    i += 1;
  }
}

export function toggleBoundary(doc: MindDoc, targetId: string, label?: string): MindDoc {
  const next = cloneDoc(doc);
  const existing = next.boundaries.findIndex((b) => b.target === targetId);
  if (existing >= 0) next.boundaries.splice(existing, 1);
  else next.boundaries.push({ id: decoId(next, 'b'), target: targetId, label });
  return next;
}

export function toggleSummary(doc: MindDoc, targetId: string, label = '概要'): MindDoc {
  const next = cloneDoc(doc);
  const existing = next.summaries.findIndex((s) => s.target === targetId);
  if (existing >= 0) next.summaries.splice(existing, 1);
  else next.summaries.push({ id: decoId(next, 's'), target: targetId, label });
  return next;
}

export function addRelation(doc: MindDoc, from: string, to: string, label?: string): MindDoc {
  if (from === to) return doc;
  const next = cloneDoc(doc);
  if (next.relations.some((r) => r.from === from && r.to === to)) return doc;
  next.relations.push({ id: decoId(next, 'r'), from, to, label });
  return next;
}

export function removeRelation(doc: MindDoc, id: string): MindDoc {
  const next = cloneDoc(doc);
  next.relations = next.relations.filter((r) => r.id !== id);
  return next;
}

export function updateDeco(
  doc: MindDoc,
  kind: 'relation' | 'boundary' | 'summary',
  id: string,
  label: string,
): MindDoc {
  const next = cloneDoc(doc);
  const list = kind === 'relation' ? next.relations : kind === 'boundary' ? next.boundaries : next.summaries;
  const item = (list as { id: string; label?: string }[]).find((x) => x.id === id);
  if (!item) return doc;
  if (label) item.label = label;
  else delete item.label;
  return next;
}
