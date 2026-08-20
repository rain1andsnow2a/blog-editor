/**
 * 思维导图渲染器 · 方案 B「稿纸」
 * ---------------------------------------------------------------------------
 * 纯 DOM 实现，不依赖任何框架，编辑器（TipTap 节点视图）与博客（Astro 客户端脚本）
 * 共用同一份代码。两个仓库各存一份副本，改动时必须同步：
 *   - blog-editor/src/lib/mindmap.ts
 *   - blog/src/scripts/mindmap.ts
 *
 * 源格式：围栏代码块 ```mindmap，正文为缩进列表。首行（零缩进）是中心主题。
 *   React 性能优化
 *     度量优先
 *       React Profiler 火焰图
 *       Lighthouse 冷启动
 *
 * 设计要点（改动前先读，否则会把手绘质感改没）：
 *   - 抖动由源文本哈希播种，同一张图每次渲染完全一致，不会刷新就变样
 *   - 列宽按标签实测宽度决定，各列在构造上互不相交 —— 硬编码列宽会导致叶子压住分支
 *   - 容器放得下就双侧展开，放不下自动改单侧，避免正文里出现横向滚动
 *   - 连接线是有机三次贝塞尔，主干 2.4px → 支干 1.4px，round linecap
 */

export type MindNode = {
  label: string;
  children: MindNode[];
};

export class MindmapError extends Error {}

/* ── 装饰兼容层 ────────────────────────────────────────────────────────────
 * 编辑器（blog-editor/src/components/MindmapCanvas.tsx）会把节点元数据写成行尾
 * {p1 60% note="…"}，把外框/概要/联系线写在 `---` 之后的指令区。静态渲染只画树，
 * 这里先把这些装饰摘掉，免得它们作为文字漏进标签、或者被当成第二个中心主题。
 * ------------------------------------------------------------------------ */

const META_TOKEN = /^(?:#\S+|p[1-7]|\d{1,3}%|collapsed|(?:note|link|img|flag)=[\s\S]*)$/;
const META_SPLIT = /(?:[^\s"]|"(?:\\.|[^"\\])*")+/g;

function stripDecorations(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const cut = lines.findIndex((line) => /^\s*---+\s*$/.test(line));
  const body = cut >= 0 ? lines.slice(0, cut) : lines;
  return body.map(stripMeta).join('\n');
}

function stripMeta(line: string): string {
  const m = /^(.*?)\s*\{([^{}]*)\}$/.exec(line);
  if (!m) return line;
  const tokens = m[2].match(META_SPLIT) || [];
  // 有一个 token 认不出来就整段当普通文字，老文章里的 `foo {bar}` 不会被吃掉
  if (!tokens.every((token) => META_TOKEN.test(token))) return line;
  return m[1];
}

/* ── 解析 ──────────────────────────────────────────────────────────────── */

/**
 * 缩进列表 → 树。容忍 2/4 空格、Tab、以及 `-` `*` `+` 列表符号。
 * 缩进宽度不必统一，靠栈比较相对深度。
 */
export function parseMindmap(source: string): MindNode {
  const rows: { indent: number; label: string }[] = [];

  stripDecorations(source).split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim()) return;

    const indent = line.length - line.trimStart().length;
    const label = line.trim().replace(/^[-*+]\s+/, '').trim();
    if (!label) throw new MindmapError(`第 ${i + 1} 行只有列表符号，没有内容`);

    rows.push({ indent, label });
  });

  if (rows.length === 0) throw new MindmapError('empty');
  if (rows[0].indent !== 0) throw new MindmapError('第 1 行是中心主题，不要缩进');

  const root: MindNode = { label: rows[0].label, children: [] };
  const stack: { indent: number; node: MindNode }[] = [{ indent: rows[0].indent, node: root }];

  for (let i = 1; i < rows.length; i += 1) {
    const { indent, label } = rows[i];
    if (indent === 0) {
      throw new MindmapError(
        `第 ${i + 1} 行「${label}」没有缩进。思维导图只能有一个中心主题，其余各行请缩进。`,
      );
    }
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const node: MindNode = { label, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent, node });
  }

  if (root.children.length === 0) throw new MindmapError('只有中心主题，缩进一行加个分支试试');
  return root;
}

/* ── 抖动：源文本哈希播种，保证确定性 ─────────────────────────────────── */

function makeRandom(seedText: string) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  seed = Math.abs(seed) || 20260729;
  return () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/* ── 布局常量 ─────────────────────────────────────────────────────────── */

const LEAF_MAX_W = 178; // 叶子列宽上限，超过就换行
const LEAF_MIN_W = 96; // 窄屏压缩时叶子列的下限，再窄就没法读了
const BRANCH_MAX_W = 160;
const BRANCH_MIN_W = 62;
const ROOT_MAX_W = 230;
const ROOT_MIN_W = 92;
const GAP_LEAF_BRANCH = 22;
const GAP_BRANCH_ROOT = 28;
const LEAF_V_GAP = 14; // 叶子之间的净间距（盒到盒）
const GROUP_V_GAP = 22; // 支路之间额外留白
const PAD_V = 12;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Side = 'L' | 'R';
type LeafBox = { el: HTMLElement; cy: number };
type BranchBox = { el: HTMLElement; cy: number; leaves: LeafBox[]; side: Side };

/* ── 渲染 ─────────────────────────────────────────────────────────────── */

export type RenderOptions = {
  /** 纸面左上角的小标题，不传则不显示 */
  label?: string;
  /** 空内容时的提示文案 */
  emptyHint?: string;
};

/**
 * 把 mindmap 源码渲染进 host。host 会被清空并加上 .mindmap 类。
 * 解析失败不抛异常，改为在纸面上显示可读的错误提示。
 */
export function renderMindmap(host: HTMLElement, source: string, options: RenderOptions = {}): void {
  host.innerHTML = '';
  host.classList.add('mindmap');

  if (options.label) {
    const label = el('div', 'mindmap__label');
    label.textContent = options.label;
    host.appendChild(label);
  }

  let tree: MindNode;
  try {
    tree = parseMindmap(source);
  } catch (err) {
    const message = err instanceof MindmapError ? err.message : '思维导图解析失败';
    const isEmpty = message === 'empty';
    const box = el('div', isEmpty ? 'mindmap__empty' : 'mindmap__error');
    box.textContent = isEmpty
      ? options.emptyHint || '写下中心主题，再缩进添加分支'
      : message;
    host.appendChild(box);
    return;
  }

  const scroll = el('div', 'mindmap__scroll');
  const stage = el('div', 'mindmap__stage');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'mindmap__links');
  stage.appendChild(svg);
  scroll.appendChild(stage);
  host.appendChild(scroll);

  const rnd = makeRandom(source);
  const jitter = (amp: number) => (rnd() - 0.5) * 2 * amp;

  /* —— 第一趟：建元素，用 nowrap 量出标签的自然宽度 —— */
  const rootEl = spawn(stage, 'mindmap-node mindmap-node--root', tree.label);
  const branchSpecs = tree.children.map((branch) => ({
    node: branch,
    el: spawn(stage, 'mindmap-node mindmap-node--branch', branch.label),
    leafTexts: flattenLeaves(branch),
  }));
  const leafSpecs = branchSpecs.flatMap((b) =>
    b.leafTexts.map((text) => ({
      owner: b,
      el: spawn(stage, 'mindmap-node mindmap-node--leaf', text),
    })),
  );

  let rootW = Math.min(natWidth(rootEl), ROOT_MAX_W);
  let branchColW = Math.min(
    Math.max(1, ...branchSpecs.map((b) => natWidth(b.el))),
    BRANCH_MAX_W,
  );
  let leafColW = Math.min(
    Math.max(1, ...leafSpecs.map((l) => natWidth(l.el))),
    LEAF_MAX_W,
  );
  let gapLeafBranch = GAP_LEAF_BRANCH;
  let gapBranchRoot = GAP_BRANCH_ROOT;

  /* —— 选布局：容器放得下就双侧，否则单侧；单侧还放不下就按
        叶子 → 分支 → 间距 → 中心节点的顺序依次压窄，
        而不是让读者在正文里横向拖动 —— */
  const avail = scroll.clientWidth || 660;
  const twoSidedW = (leafColW + gapLeafBranch + branchColW + gapBranchRoot) * 2 + rootW;
  const twoSided = tree.children.length >= 2 && twoSidedW <= avail;

  if (!twoSided) {
    const shrink = (current: number, floor: number, need: number) => {
      const cut = Math.min(need, Math.max(0, current - floor));
      return { value: current - cut, left: need - cut };
    };
    let need = rootW + gapBranchRoot + branchColW + gapLeafBranch + leafColW - avail;

    if (need > 0) ({ value: leafColW, left: need } = shrink(leafColW, LEAF_MIN_W, need));
    if (need > 0) ({ value: branchColW, left: need } = shrink(branchColW, BRANCH_MIN_W, need));
    if (need > 0) ({ value: gapLeafBranch, left: need } = shrink(gapLeafBranch, 12, need));
    if (need > 0) ({ value: gapBranchRoot, left: need } = shrink(gapBranchRoot, 14, need));
    if (need > 0) ({ value: rootW } = shrink(rootW, ROOT_MIN_W, need));
  }

  const armW = leafColW + gapLeafBranch + branchColW + gapBranchRoot;
  const W = Math.max(twoSided ? armW * 2 + rootW : armW + rootW, avail);
  stage.style.width = `${W}px`;

  /* —— 第二趟：定死列宽，放开换行 —— */
  rootEl.style.whiteSpace = 'normal';
  rootEl.style.maxWidth = `${rootW}px`;
  branchSpecs.forEach((b) => {
    b.el.style.whiteSpace = 'normal';
    b.el.style.maxWidth = `${branchColW}px`;
  });
  leafSpecs.forEach((l) => {
    l.el.style.whiteSpace = 'normal';
    l.el.style.width = `${leafColW}px`;
  });

  /* —— 分侧：双侧时右半区优先（思维导图惯例）—— */
  const sides: { side: Side; branches: typeof branchSpecs }[] = twoSided
    ? (() => {
        const rightCount = Math.ceil(branchSpecs.length / 2);
        return [
          { side: 'R' as Side, branches: branchSpecs.slice(0, rightCount) },
          { side: 'L' as Side, branches: branchSpecs.slice(rightCount) },
        ];
      })()
    : [{ side: 'R' as Side, branches: branchSpecs }];

  /* —— 列的 x 坐标：各列区间互不相交，从构造上排除叠压 —— */
  const centerX = twoSided ? W / 2 : rootW / 2;
  const cols = {
    R: {
      branchLeft: centerX + rootW / 2 + gapBranchRoot,
      leafLeft: centerX + rootW / 2 + gapBranchRoot + branchColW + gapLeafBranch,
    },
    L: {
      // 左侧分支贴住中心一侧（锚右边缘），叶子在最外侧
      branchRightEdge: centerX - rootW / 2 - gapBranchRoot,
      leafLeft: centerX - rootW / 2 - gapBranchRoot - branchColW - gapLeafBranch - leafColW,
    },
  };

  /* —— 第三趟 A：先在各侧的局部坐标里算高度，不落 top —— */
  type PlanItem = { spec: (typeof branchSpecs)[number]; cy: number; leaves: LeafBox[] };
  const plans: { side: Side; items: PlanItem[]; height: number }[] = [];
  let leafCursor = 0;

  sides.forEach(({ side, branches }) => {
    let y = 0;
    const items: PlanItem[] = branches.map((spec, bi) => {
      if (bi > 0) y += GROUP_V_GAP;

      const leaves: LeafBox[] = spec.leafTexts.map(() => {
        const leafEl = leafSpecs[leafCursor].el;
        leafCursor += 1;
        if (side === 'L') leafEl.classList.add('is-left');
        leafEl.style.left = `${side === 'L' ? cols.L.leafLeft : cols.R.leafLeft}px`;

        const h = leafEl.offsetHeight || 20;
        const cy = y + h / 2;
        y += h + LEAF_V_GAP;
        return { el: leafEl, cy };
      });

      if (leaves.length) {
        return { spec, cy: (leaves[0].cy + leaves[leaves.length - 1].cy) / 2, leaves };
      }
      const h = spec.el.offsetHeight || 30;
      const cy = y + h / 2;
      y += h + LEAF_V_GAP;
      return { spec, cy, leaves };
    });

    plans.push({ side, items, height: Math.max(0, y - LEAF_V_GAP) });
  });

  /* —— 第三趟 B：两臂各自垂直居中后再落 top —— */
  const contentH = Math.max(...plans.map((p) => p.height));
  const H = contentH + PAD_V * 2;
  stage.style.height = `${H}px`;

  const allBranches: BranchBox[] = [];
  plans.forEach(({ side, items, height }) => {
    const offset = PAD_V + (contentH - height) / 2;

    items.forEach(({ spec, cy, leaves }) => {
      leaves.forEach((leaf) => {
        leaf.cy += offset;
        leaf.el.style.top = `${leaf.cy}px`;
        leaf.el.style.visibility = '';
      });

      const branchCy = cy + offset;
      spec.el.style.top = `${branchCy}px`;
      spec.el.style.transform = `translateY(-50%) rotate(${jitter(0.9).toFixed(2)}deg)`;
      if (side === 'L') {
        // 必须清掉 spawn 时的 left，否则 left+right 同时生效会把胶囊压变形
        spec.el.style.left = '';
        spec.el.style.right = `${W - cols.L.branchRightEdge}px`;
      } else {
        spec.el.style.left = `${cols.R.branchLeft}px`;
      }
      spec.el.style.visibility = '';

      allBranches.push({ el: spec.el, cy: branchCy, leaves, side });
    });
  });

  rootEl.style.top = `${H / 2}px`;
  rootEl.style.left = `${centerX}px`;
  rootEl.style.transform = `translate(-50%, -50%) rotate(${jitter(1).toFixed(2)}deg)`;
  rootEl.style.visibility = '';

  /* —— 第四趟：实测盒子再画曲线 —— */
  const draw = () => {
    const base = stage.getBoundingClientRect();
    if (!base.width) return;
    const box = (node: HTMLElement) => {
      const r = node.getBoundingClientRect();
      return {
        l: r.left - base.left,
        r: r.right - base.left,
        cy: r.top - base.top + r.height / 2,
      };
    };

    const rb = box(rootEl);
    const paths: string[] = [];

    allBranches.forEach((branch) => {
      const bb = box(branch.el);
      const isL = branch.side === 'L';

      paths.push(
        path(curve(isL ? rb.l - 4 : rb.r + 4, rb.cy, isL ? bb.r + 5 : bb.l - 5, bb.cy, jitter), 2.4),
      );

      branch.leaves.forEach((leaf) => {
        const lb = box(leaf.el);
        paths.push(
          path(curve(isL ? bb.l - 4 : bb.r + 4, bb.cy, isL ? lb.r - 2 : lb.l + 2, leaf.cy, jitter), 1.4),
        );
      });
    });

    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = paths.join('');
  };

  draw();
  // 字体异步就绪后线头会偏，等字体加载完补画一次
  const fonts = (document as any).fonts;
  if (fonts?.ready) fonts.ready.then(draw).catch(() => {});
}

/* ── 工具 ─────────────────────────────────────────────────────────────── */

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** 建节点并挂进 stage，先 nowrap + hidden 以便量自然宽度 */
function spawn(stage: HTMLElement, className: string, text: string): HTMLElement {
  const node = el('div', className);
  node.textContent = text;
  node.style.whiteSpace = 'nowrap';
  node.style.visibility = 'hidden';
  node.style.left = '0px';
  node.style.top = '0px';
  stage.appendChild(node);
  return node;
}

/**
 * 标签的自然宽度。必须用 getBoundingClientRect 向上取整再 +1：
 * offsetWidth 是向下取整的整数，拿它当 maxWidth 会差半个像素，
 * 于是「React 性能优化」这种刚好放得下的标签被挤成两行。
 */
function natWidth(node: HTMLElement): number {
  return Math.ceil(node.getBoundingClientRect().width) + 1;
}

function path(d: string, width: number): string {
  return `<path d="${d}" fill="none" stroke="#C3B394" stroke-width="${width}" stroke-linecap="round" opacity="0.92"/>`;
}

/** 有机三次贝塞尔：控制点带固定抖动，模拟手腕转动而非机器画线 */
function curve(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  jitter: (amp: number) => number,
): string {
  const dx = (x2 - x1) * 0.55;
  const c1y = y1 + jitter(6);
  const c2y = y2 + jitter(5);
  return `M${round(x1)} ${round(y1)} C${round(x1 + dx)} ${round(c1y)}, ${round(x2 - dx)} ${round(
    c2y,
  )}, ${round(x2)} ${round(y2)}`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 三级及更深的节点在稿纸方案里不单独画框，按「父级 · 子级」压平成叶子文本，
 * 保证纸面不被撑爆。层级更深时用 · 连接，读者仍能看出归属。
 */
function flattenLeaves(branch: MindNode): string[] {
  const out: string[] = [];
  const walk = (node: MindNode, prefix: string) => {
    const label = prefix ? `${prefix} · ${node.label}` : node.label;
    if (node.children.length === 0) {
      out.push(label);
      return;
    }
    node.children.forEach((child) => walk(child, label));
  };
  branch.children.forEach((child) => walk(child, ''));
  return out;
}
