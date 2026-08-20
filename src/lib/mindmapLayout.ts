/**
 * 思维导图布局引擎
 * ---------------------------------------------------------------------------
 * 纯函数：树 + 实测尺寸 → 坐标。你永远不需要手动对齐位置，这是导图和白板
 * 工具的本质区别 —— 逻辑关系归用户，排版归算法。
 *
 * 约定：
 *   - 任意深度都单独成节点（不再像旧版静态渲染那样把三级以下压平成叶子文本），
 *     否则交互式编辑里会出现「看得见却选不中」的节点。
 *   - 根的孩子按下标奇偶分左右：新增分支不会让已有分支跳到另一侧，
 *     编辑时视觉更稳定。
 *   - 子树高度自底向上算，父节点纵坐标取首尾孩子中点 —— 教科书式导图观感。
 *   - 抖动由节点 id 播种，保证同一张图每次渲染完全一致。
 */

import type { MindDoc, MindNode } from './mindmapModel';

export type Side = 'L' | 'R';

export type MMBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  depth: number;
  side: Side;
  parentId?: string;
  childCount: number;
  collapsed: boolean;
};

export type MMLink = { id: string; d: string; width: number };

export type MMBoundaryGeom = {
  id: string;
  target: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
};

export type MMSummaryGeom = {
  id: string;
  target: string;
  label: string;
  d: string;
  labelX: number;
  labelY: number;
  side: Side;
};

export type MMRelationGeom = {
  id: string;
  d: string;
  arrow: string;
  label?: string;
  labelX: number;
  labelY: number;
};

export type MMLayout = {
  width: number;
  height: number;
  boxes: Record<string, MMBox>;
  links: MMLink[];
  boundaries: MMBoundaryGeom[];
  summaries: MMSummaryGeom[];
  relations: MMRelationGeom[];
};

export type MMSize = { w: number; h: number };
export type MMSizes = Record<string, MMSize>;

const PAD = 26;
const H_GAP_ROOT = 46;
const H_GAP = 32;
const V_GAP = 12;
const V_GAP_GROUP = 20;
const BOUNDARY_PAD = 13;
const SUMMARY_GAP = 12;
const SUMMARY_ARM = 16;

const FALLBACK: MMSize = { w: 110, h: 30 };

export function layoutMindmap(doc: MindDoc, sizes: MMSizes): MMLayout {
  const size = (key: string): MMSize => sizes[key] || FALLBACK;
  const boundaryOf = new Map(doc.boundaries.map((b) => [b.target, b] as const));
  const summaryOf = new Map(doc.summaries.map((s) => [s.target, s] as const));

  const kidsOf = (node: MindNode): MindNode[] => (node.collapsed ? [] : node.children);

  /* —— 第一趟：子树高度 —— */
  const subH = new Map<string, number>();
  const measure = (node: MindNode): number => {
    const kids = kidsOf(node);
    const own = size(node.id).h;
    let height = own;
    if (kids.length) {
      let total = 0;
      kids.forEach((kid, i) => {
        if (i) total += gapBetween(kids[i - 1], kid);
        total += measure(kid);
      });
      height = Math.max(own, total);
    }
    if (boundaryOf.has(node.id)) height += BOUNDARY_PAD * 2;
    subH.set(node.id, height);
    return height;
  };

  const gapBetween = (a: MindNode, b: MindNode): number =>
    kidsOf(a).length || kidsOf(b).length ? V_GAP_GROUP : V_GAP;

  const childrenSpan = (node: MindNode): number => {
    const kids = kidsOf(node);
    let total = 0;
    kids.forEach((kid, i) => {
      if (i) total += gapBetween(kids[i - 1], kid);
      total += subH.get(kid.id) ?? measure(kid);
    });
    return total;
  };

  const rootSize = size(doc.root.id);
  const right: MindNode[] = [];
  const left: MindNode[] = [];
  kidsOf(doc.root).forEach((kid, i) => (i % 2 === 0 ? right : left).push(kid));
  [...right, ...left].forEach(measure);

  const armSpan = (list: MindNode[]): number => {
    let total = 0;
    list.forEach((node, i) => {
      if (i) total += V_GAP_GROUP;
      total += subH.get(node.id) ?? 0;
    });
    return total;
  };

  const spanR = armSpan(right);
  const spanL = armSpan(left);
  const contentH = Math.max(rootSize.h, spanR, spanL);

  /* —— 第二趟：落坐标。root 左上角先记在 (0,0)，最后统一平移 —— */
  const boxes: Record<string, MMBox> = {};

  const place = (node: MindNode, anchorX: number, top: number, dirRight: boolean, depth: number, parentId?: string) => {
    const s = size(node.id);
    const band = subH.get(node.id) ?? s.h;
    const x = dirRight ? anchorX : anchorX - s.w;
    const kids = kidsOf(node);
    let cy: number;

    if (!kids.length) {
      cy = top + band / 2;
    } else {
      const span = childrenSpan(node);
      const gap = depth === 0 ? H_GAP_ROOT : H_GAP;
      const childAnchor = dirRight ? x + s.w + gap : x - gap;
      let cursor = top + (band - span) / 2;
      const centers: number[] = [];
      kids.forEach((kid, i) => {
        if (i) cursor += gapBetween(kids[i - 1], kid);
        place(kid, childAnchor, cursor, dirRight, depth + 1, node.id);
        centers.push(boxes[kid.id].cy);
        cursor += subH.get(kid.id) ?? 0;
      });
      cy = (centers[0] + centers[centers.length - 1]) / 2;
    }

    boxes[node.id] = {
      id: node.id,
      x,
      y: cy - s.h / 2,
      w: s.w,
      h: s.h,
      cx: x + s.w / 2,
      cy,
      depth,
      side: dirRight ? 'R' : 'L',
      parentId,
      childCount: node.children.length,
      collapsed: Boolean(node.collapsed),
    };
  };

  const rootCy = contentH / 2;
  boxes[doc.root.id] = {
    id: doc.root.id,
    x: 0,
    y: rootCy - rootSize.h / 2,
    w: rootSize.w,
    h: rootSize.h,
    cx: rootSize.w / 2,
    cy: rootCy,
    depth: 0,
    side: 'R',
    childCount: doc.root.children.length,
    collapsed: Boolean(doc.root.collapsed),
  };

  const placeArm = (list: MindNode[], span: number, dirRight: boolean) => {
    let cursor = (contentH - span) / 2;
    list.forEach((node, i) => {
      if (i) cursor += V_GAP_GROUP;
      place(node, dirRight ? rootSize.w + H_GAP_ROOT : -H_GAP_ROOT, cursor, dirRight, 1, doc.root.id);
      cursor += subH.get(node.id) ?? 0;
    });
  };
  placeArm(right, spanR, true);
  placeArm(left, spanL, false);

  /* —— 装饰几何：先算原始坐标，平移后再生成 path —— */
  const visibleIds = new Set(Object.keys(boxes));
  const nodeIndex = new Map<string, MindNode>();
  walkTree(doc.root, (n) => nodeIndex.set(n.id, n));
  const bbox = (id: string) => {
    const stack = [id];
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    while (stack.length) {
      const current = stack.pop()!;
      const box = boxes[current];
      if (!box) continue;
      x1 = Math.min(x1, box.x);
      y1 = Math.min(y1, box.y);
      x2 = Math.max(x2, box.x + box.w);
      y2 = Math.max(y2, box.y + box.h);
      const node = nodeIndex.get(current);
      if (node && !node.collapsed) node.children.forEach((c) => stack.push(c.id));
    }
    if (x1 === Infinity) return null;
    return { x1, y1, x2, y2 };
  };

  type RawBoundary = { id: string; target: string; label?: string; x: number; y: number; w: number; h: number };
  const rawBoundaries: RawBoundary[] = [];
  doc.boundaries.forEach((b) => {
    if (!visibleIds.has(b.target)) return;
    const box = bbox(b.target);
    if (!box) return;
    rawBoundaries.push({
      id: b.id,
      target: b.target,
      label: b.label,
      x: box.x1 - BOUNDARY_PAD,
      y: box.y1 - BOUNDARY_PAD,
      w: box.x2 - box.x1 + BOUNDARY_PAD * 2,
      h: box.y2 - box.y1 + BOUNDARY_PAD * 2,
    });
  });

  type RawSummary = { id: string; target: string; label: string; side: Side; x: number; y1: number; y2: number };
  const rawSummaries: RawSummary[] = [];
  doc.summaries.forEach((s) => {
    if (!visibleIds.has(s.target)) return;
    const box = bbox(s.target);
    if (!box) return;
    const side = boxes[s.target].side;
    rawSummaries.push({
      id: s.id,
      target: s.target,
      label: s.label || '概要',
      side,
      x: side === 'R' ? box.x2 + SUMMARY_GAP : box.x1 - SUMMARY_GAP,
      y1: box.y1,
      y2: box.y2,
    });
  });

  /* —— 边界盒 → 平移量 —— */
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const feed = (x1: number, y1: number, x2: number, y2: number) => {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  };
  Object.values(boxes).forEach((b) => feed(b.x, b.y, b.x + b.w, b.y + b.h));
  rawBoundaries.forEach((b) => feed(b.x, b.y, b.x + b.w, b.y + b.h));
  rawSummaries.forEach((s) => {
    const labelSize = size(`summary:${s.id}`);
    const armEnd = s.side === 'R' ? s.x + SUMMARY_ARM + labelSize.w + 8 : s.x - SUMMARY_ARM - labelSize.w - 8;
    feed(Math.min(s.x, armEnd), s.y1, Math.max(s.x, armEnd), s.y2);
  });
  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  const dx = PAD - minX;
  const dy = PAD - minY;
  Object.values(boxes).forEach((b) => {
    b.x += dx;
    b.y += dy;
    b.cx += dx;
    b.cy += dy;
  });

  const width = maxX - minX + PAD * 2;
  const height = maxY - minY + PAD * 2;

  /* —— 连接线：有机三次贝塞尔，主干粗、支干细 —— */
  const links: MMLink[] = [];
  walkTree(doc.root, (node) => {
    if (node.collapsed) return;
    const parentBox = boxes[node.id];
    if (!parentBox) return;
    node.children.forEach((child) => {
      const childBox = boxes[child.id];
      if (!childBox) return;
      const toRight = childBox.cx >= parentBox.cx;
      const x1 = toRight ? parentBox.x + parentBox.w : parentBox.x;
      const x2 = toRight ? childBox.x : childBox.x + childBox.w;
      const jitter = jitterFor(child.id);
      links.push({
        id: `${node.id}-${child.id}`,
        d: organicCurve(x1, parentBox.cy, x2, childBox.cy, jitter),
        width: childBox.depth <= 1 ? 2.4 : childBox.depth === 2 ? 1.7 : 1.3,
      });
    });
  });

  const boundaries: MMBoundaryGeom[] = rawBoundaries.map((b) => ({
    id: b.id,
    target: b.target,
    label: b.label,
    x: b.x + dx,
    y: b.y + dy,
    w: b.w,
    h: b.h,
  }));

  const summaries: MMSummaryGeom[] = rawSummaries.map((s) => {
    const x = s.x + dx;
    const y1 = s.y1 + dy;
    const y2 = s.y2 + dy;
    const ym = (y1 + y2) / 2;
    const dir = s.side === 'R' ? 1 : -1;
    const arm = SUMMARY_ARM * dir;
    const d = [
      `M${round(x)} ${round(y1)}`,
      `C${round(x + arm * 0.6)} ${round(y1)}, ${round(x + arm * 0.6)} ${round(ym)}, ${round(x + arm)} ${round(ym)}`,
      `C${round(x + arm * 0.6)} ${round(ym)}, ${round(x + arm * 0.6)} ${round(y2)}, ${round(x)} ${round(y2)}`,
    ].join(' ');
    return {
      id: s.id,
      target: s.target,
      label: s.label,
      d,
      labelX: x + arm + 6 * dir,
      labelY: ym,
      side: s.side,
    };
  });

  const relations: MMRelationGeom[] = [];
  doc.relations.forEach((rel) => {
    const a = boxes[rel.from];
    const b = boxes[rel.to];
    if (!a || !b) return;
    const toRight = b.cx >= a.cx;
    const x1 = toRight ? a.x + a.w : a.x;
    const x2 = toRight ? b.x : b.x + b.w;
    const dir = toRight ? 1 : -1;
    const reach = Math.max(60, Math.abs(x2 - x1) * 0.45);
    const bow = Math.max(26, Math.abs(b.cy - a.cy) * 0.25);
    const c1x = x1 + dir * reach;
    const c1y = a.cy - bow;
    const c2x = x2 - dir * reach;
    const c2y = b.cy - bow;
    const d = `M${round(x1)} ${round(a.cy)} C${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(x2)} ${round(b.cy)}`;
    relations.push({
      id: rel.id,
      d,
      arrow: arrowHead(c2x, c2y, x2, b.cy),
      label: rel.label,
      labelX: bezierAt(x1, c1x, c2x, x2, 0.5),
      labelY: bezierAt(a.cy, c1y, c2y, b.cy, 0.5) - 6,
    });
  });

  return { width, height, boxes, links, boundaries, summaries, relations };
}

/* ── 工具 ─────────────────────────────────────────────────────────────── */

function walkTree(node: MindNode, visit: (node: MindNode) => void) {
  visit(node);
  node.children.forEach((child) => walkTree(child, visit));
}

/** id 播种的确定性抖动，刷新不会变样 */
function jitterFor(seedText: string) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  seed = Math.abs(seed) || 20260729;
  return (amp: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff - 0.5) * 2 * amp;
  };
}

function organicCurve(x1: number, y1: number, x2: number, y2: number, jitter: (amp: number) => number): string {
  const dx = (x2 - x1) * 0.55;
  const c1y = y1 + jitter(5);
  const c2y = y2 + jitter(4);
  return `M${round(x1)} ${round(y1)} C${round(x1 + dx)} ${round(c1y)}, ${round(x2 - dx)} ${round(c2y)}, ${round(x2)} ${round(y2)}`;
}

function arrowHead(fromX: number, fromY: number, toX: number, toY: number): string {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const len = 9;
  const spread = 0.42;
  const p1x = toX - len * Math.cos(angle - spread);
  const p1y = toY - len * Math.sin(angle - spread);
  const p2x = toX - len * Math.cos(angle + spread);
  const p2y = toY - len * Math.sin(angle + spread);
  return `M${round(toX)} ${round(toY)} L${round(p1x)} ${round(p1y)} L${round(p2x)} ${round(p2y)} Z`;
}

function bezierAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
