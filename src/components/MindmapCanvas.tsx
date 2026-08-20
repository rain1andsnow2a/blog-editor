/**
 * 交互式思维导图画布
 * ---------------------------------------------------------------------------
 * 键盘驱动，手不用碰鼠标：
 *   Tab 子节点 / Enter 同级 / F2·空格·双击 编辑 / Delete 删子树 / 方向键 走位
 *   Alt+↑↓ 换顺序 / Alt+←→ 升降级 / \ 折叠 / 1-7 优先级 / P 进度 / F 旗标
 *   N 备注 / B 外框 / S 概要 / L 联系线 / Esc 退出
 * 结构调整靠拖拽：拖到节点上 = 整棵子树改换门庭，拖到节点上下边缘 = 只换顺序。
 * 布局永远由算法算，用户只管逻辑关系。
 */

import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Braces, Check, Flag, Frame, HelpCircle, Image as ImageIcon,
  Keyboard, Lightbulb, Link2, Maximize2, Minimize2, Pencil, Plus, Scan, Star,
  StickyNote, Trash2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  DEFAULT_ROOT_LABEL, MIND_FLAGS, addChild, addRelation, addSibling, cloneDoc, findNode,
  indentNode, moveNode, outdentNode, parseMindmapDoc, removeNode, serializeMindmapDoc,
  shiftNode, subtreeIds, toggleBoundary, toggleCollapse, toggleSummary, updateDeco, updateNode,
  type MindDoc, type MindFlag, type MindNode,
} from '../lib/mindmapModel';
import { layoutMindmap, type MMLayout, type MMSizes, type Side } from '../lib/mindmapLayout';
import { uploadImage } from '../lib/api';

type DecoRef = { kind: 'relation' | 'boundary' | 'summary'; id: string };
type DropMode = 'child' | 'before' | 'after';
type DragState = { id: string; x: number; y: number; moved: boolean; target?: string; mode?: DropMode };

const PRIORITY_COLORS = ['#d44c47', '#d9730d', '#cb912f', '#448361', '#337ea9', '#9065b0', '#787774'];
const PROGRESS_STEPS = [0, 25, 50, 75, 100];

const FLAG_ICONS: Record<MindFlag, typeof Flag> = {
  flag: Flag,
  star: Star,
  check: Check,
  question: HelpCircle,
  idea: Lightbulb,
  warn: AlertTriangle,
};
const FLAG_LABELS: Record<MindFlag, string> = {
  flag: '旗标',
  star: '星标',
  check: '完成',
  question: '疑问',
  idea: '灵感',
  warn: '注意',
};

export type MindmapCanvasProps = {
  source: string;
  onChange: (source: string) => void;
  /** 源码开关由外层代码块持有，这里只画按钮 */
  sourceVisible?: boolean;
  onToggleSource?: () => void;
  /** 删除整个思维导图块（由外层 NodeView 提供，在文档中移除该代码块） */
  onDeleteBlock?: () => void;
  /** 专注（全屏）编辑：由外层 NodeView 控制进出 */
  fullscreen?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
};

export default function MindmapCanvas({ source, onChange, sourceVisible, onToggleSource, onDeleteBlock, fullscreen, onEnterFullscreen, onExitFullscreen }: MindmapCanvasProps) {
  const [doc, setDoc] = useState<MindDoc>(() => parseMindmapDoc(source));
  const [selectedId, setSelectedId] = useState<string>(() => '');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDeco, setSelectedDeco] = useState<DecoRef | null>(null);
  const [layout, setLayout] = useState<MMLayout | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [notePeek, setNotePeek] = useState<string | null>(null);
  const [inspector, setInspector] = useState(false);
  const [hints, setHints] = useState(false);
  const [focused, setFocused] = useState(false);
  /** 右键菜单：node = 节点菜单 / canvas = 画布菜单，坐标都相对根容器 */
  const [ctxMenu, setCtxMenu] = useState<{ kind: 'node' | 'canvas'; id: string; x: number; y: number } | null>(null);
  /** 画布缩放倍率：布局尺寸不变，只缩放呈现 */
  const [zoom, setZoom] = useState(1);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const summaryRefs = useRef(new Map<string, HTMLDivElement>());
  const editRef = useRef<HTMLDivElement | null>(null);
  const emittedRef = useRef(source);
  const layoutSigRef = useRef('');
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  /* —— 源码 ⇄ 状态：只在外部（撤销、手改源码）变化时重新解析 —— */
  useEffect(() => {
    if (source === emittedRef.current) return;
    emittedRef.current = source;
    const next = parseMindmapDoc(source);
    setDoc(next);
    setEditingId(null);
    setSelectedId((current) => (current && findNode(next, current) ? current : ''));
  }, [source]);

  const commit = useCallback(
    (next: MindDoc, select?: string) => {
      setDoc(next);
      if (select !== undefined) setSelectedId(select);
      const text = serializeMindmapDoc(next);
      emittedRef.current = text;
      onChange(text);
    },
    [onChange],
  );

  const nodeIndex = useMemo(() => {
    const map = new Map<string, { node: MindNode; parent?: MindNode; depth: number }>();
    const visit = (node: MindNode, parent: MindNode | undefined, depth: number) => {
      map.set(node.id, { node, parent, depth });
      node.children.forEach((child) => visit(child, node, depth + 1));
    };
    visit(doc.root, undefined, 0);
    return map;
  }, [doc]);

  const visibleNodes = useMemo(() => {
    const out: { node: MindNode; depth: number; parent?: MindNode }[] = [];
    const visit = (node: MindNode, parent: MindNode | undefined, depth: number) => {
      out.push({ node, parent, depth });
      if (!node.collapsed) node.children.forEach((child) => visit(child, node, depth + 1));
    };
    visit(doc.root, undefined, 0);
    return out;
  }, [doc]);

  const selected = selectedId ? nodeIndex.get(selectedId)?.node : undefined;

  /* —— 量尺寸 → 算布局。测量用 offsetWidth，不受 transform 旋转影响 —— */
  const relayout = useCallback(() => {
    const sizes: MMSizes = {};
    nodeRefs.current.forEach((el, id) => {
      if (!el.isConnected) return;
      sizes[id] = { w: el.offsetWidth + 1, h: el.offsetHeight };
    });
    summaryRefs.current.forEach((el, id) => {
      if (!el.isConnected) return;
      sizes[`summary:${id}`] = { w: el.offsetWidth + 1, h: el.offsetHeight };
    });
    if (!sizes[doc.root.id]) return;
    const next = layoutMindmap(doc, sizes);
    const sig = JSON.stringify(next);
    if (sig === layoutSigRef.current) return;
    layoutSigRef.current = sig;
    setLayout(next);
  }, [doc]);

  useLayoutEffect(() => {
    relayout();
  });

  useEffect(() => {
    const fonts = (document as any).fonts;
    if (fonts?.ready) fonts.ready.then(() => relayout()).catch(() => {});
    const onResize = () => relayout();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [relayout]);

  /* —— 缩放：工具条按钮 / Ctrl+滚轮 —— */
  const clampZoom = (z: number) => Math.min(3, Math.max(0.25, Math.round(z * 100) / 100));
  const zoomBy = useCallback((factor: number) => setZoom((z) => clampZoom(z * factor)), []);
  const fitView = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !layout) return;
    const pad = 16;
    const z = Math.min((el.clientWidth - pad) / layout.width, (el.clientHeight - pad) / layout.height);
    setZoom(clampZoom(z));
  }, [layout]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* —— 进入编辑：文本用命令式写入，避免受控 contentEditable 光标乱跳 —— */
  useEffect(() => {
    if (!editingId) return;
    const el = editRef.current;
    const node = nodeIndex.get(editingId)?.node;
    if (!el || !node) return;
    el.textContent = node.label;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    relayout();
  }, [editingId, nodeIndex, relayout]);

  const focusStage = useCallback(() => {
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  const finishEdit = useCallback(
    (options: { then?: 'sibling' | 'child' | 'none' } = {}) => {
      const id = editingId;
      if (!id) return;
      const raw = editRef.current?.textContent ?? '';
      const label = raw.replace(/\s+/g, ' ').trim();
      const node = nodeIndex.get(id)?.node;
      setEditingId(null);

      let next = doc;
      if (node && label !== node.label) next = updateNode(doc, id, { label });
      // 空标签的新节点直接撤掉，免得图里留下幽灵
      if (!label && node && !node.children.length && id !== doc.root.id) {
        const removed = removeNode(next, id);
        commit(removed.doc, removed.selectId);
        focusStage();
        return;
      }
      if (!label && id === doc.root.id) next = updateNode(next, id, { label: DEFAULT_ROOT_LABEL });

      const then = options.then ?? 'none';
      if (then === 'sibling') {
        const result = addSibling(next, id);
        commit(result.doc, result.selectId);
        setEditingId(result.selectId);
        return;
      }
      if (then === 'child') {
        const result = addChild(next, id);
        commit(result.doc, result.selectId);
        setEditingId(result.selectId);
        return;
      }
      if (next !== doc) commit(next, id);
      focusStage();
    },
    [commit, doc, editingId, focusStage, nodeIndex],
  );

  const startEdit = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedDeco(null);
    setEditingId(id);
  }, []);

  const createChild = useCallback(
    (id: string) => {
      const result = addChild(doc, id);
      commit(result.doc, result.selectId);
      setEditingId(result.selectId);
    },
    [commit, doc],
  );

  const createSibling = useCallback(
    (id: string, before = false) => {
      const result = addSibling(doc, id, '', before);
      commit(result.doc, result.selectId);
      setEditingId(result.selectId);
    },
    [commit, doc],
  );

  const deleteNode = useCallback(
    (id: string) => {
      if (id === doc.root.id) return;
      const result = removeNode(doc, id);
      commit(result.doc, result.selectId);
      focusStage();
    },
    [commit, doc, focusStage],
  );

  /* 右键菜单打开时，点击任意处 / Esc 都关闭 */
  useEffect(() => {
    if (!ctxMenu) return undefined;
    const closeOnPointer = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.mmap-ctxmenu')) return; // 菜单自身的点击交给菜单项
      setCtxMenu(null);
    };
    const closeOnKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    window.addEventListener('pointerdown', closeOnPointer, true);
    window.addEventListener('keydown', closeOnKey, true);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointer, true);
      window.removeEventListener('keydown', closeOnKey, true);
    };
  }, [ctxMenu]);

  const openNodeContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    // 坐标相对根容器（不受缩放影响），菜单统一渲染在根层级
    const rect = root.getBoundingClientRect();
    setSelectedId(id);
    setSelectedDeco(null);
    setEditingId(null);
    setCtxMenu({ kind: 'node', id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  /** 画布空白处 / 工具条区域右键：针对整个思维导图块的菜单 */
  const openCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    // 输入控件保留浏览器自带的右键菜单（复制/粘贴）
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setCtxMenu({ kind: 'canvas', id: '', x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const patch = useCallback(
    (id: string, values: Partial<Omit<MindNode, 'id' | 'children'>>) => {
      commit(updateNode(doc, id, values), id);
    },
    [commit, doc],
  );

  /* —— 方向键走位：按树语义，右侧向外 = 进子层 —— */
  const navigate = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      if (!selectedId || !layout) return;
      const box = layout.boxes[selectedId];
      const entry = nodeIndex.get(selectedId);
      if (!box || !entry) return;
      const { node, parent } = entry;

      if (dir === 'left' || dir === 'right') {
        if (selectedId === doc.root.id) {
          const wantSide: Side = dir === 'right' ? 'R' : 'L';
          const target = node.children.find((child) => layout.boxes[child.id]?.side === wantSide);
          if (target) setSelectedId(target.id);
          return;
        }
        const outward = box.side === 'R' ? 'right' : 'left';
        if (dir === outward) {
          if (node.collapsed) {
            commit(toggleCollapse(doc, selectedId, false), selectedId);
            return;
          }
          if (node.children[0]) setSelectedId(node.children[0].id);
        } else if (parent) {
          setSelectedId(parent.id);
        }
        return;
      }

      const pool = visibleNodes
        .map(({ node: n }) => layout.boxes[n.id])
        .filter((b): b is NonNullable<typeof b> => Boolean(b) && b.id !== selectedId && b.side === box.side);
      const forward = dir === 'down';
      const candidates = pool.filter((b) => (forward ? b.cy > box.cy + 1 : b.cy < box.cy - 1));
      if (!candidates.length) return;
      const sameDepth = candidates.filter((b) => b.depth === box.depth);
      const list = sameDepth.length ? sameDepth : candidates;
      list.sort((a, b) => Math.abs(a.cy - box.cy) - Math.abs(b.cy - box.cy) || Math.abs(a.cx - box.cx) - Math.abs(b.cx - box.cx));
      setSelectedId(list[0].id);
    },
    [commit, doc, layout, nodeIndex, selectedId, visibleNodes],
  );

  const cycleProgress = useCallback(
    (id: string) => {
      const current = nodeIndex.get(id)?.node.progress;
      const index = current == null ? -1 : PROGRESS_STEPS.indexOf(current);
      const next = index < 0 ? 0 : index >= PROGRESS_STEPS.length - 1 ? undefined : PROGRESS_STEPS[index + 1];
      patch(id, { progress: next });
    },
    [nodeIndex, patch],
  );

  const cycleFlag = useCallback(
    (id: string) => {
      const current = nodeIndex.get(id)?.node.flag;
      const index = current ? MIND_FLAGS.indexOf(current) : -1;
      const next = index >= MIND_FLAGS.length - 1 ? undefined : MIND_FLAGS[index + 1];
      patch(id, { flag: next });
    },
    [nodeIndex, patch],
  );

  const openNote = useCallback(
    (id: string) => {
      setSelectedId(id);
      setInspector(true);
      setNotePeek(null);
      requestAnimationFrame(() => noteInputRef.current?.focus());
    },
    [],
  );

  const startRelation = useCallback(
    (id: string) => {
      setLinkFrom(id);
      focusStage();
    },
    [focusStage],
  );

  /* —— 画布快捷键 —— */
  const onStageKeyDown = (event: React.KeyboardEvent) => {
    if (editingId) return;
    const id = selectedId || doc.root.id;
    const key = event.key;
    const mod = event.altKey || event.ctrlKey || event.metaKey;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };

    if (key === 'Escape') {
      stop();
      if (linkFrom) setLinkFrom(null);
      else if (notePeek) setNotePeek(null);
      else if (selectedDeco) setSelectedDeco(null);
      else if (selectedId) setSelectedId('');
      else if (onExitFullscreen) onExitFullscreen();
      return;
    }
    if (selectedDeco && (key === 'Delete' || key === 'Backspace')) {
      stop();
      const next = cloneDoc(doc);
      if (selectedDeco.kind === 'relation') next.relations = next.relations.filter((r) => r.id !== selectedDeco.id);
      if (selectedDeco.kind === 'boundary') next.boundaries = next.boundaries.filter((b) => b.id !== selectedDeco.id);
      if (selectedDeco.kind === 'summary') next.summaries = next.summaries.filter((s) => s.id !== selectedDeco.id);
      setSelectedDeco(null);
      commit(next);
      return;
    }
    if (!selectedId && key !== 'Tab' && key !== 'Enter') {
      if (key.startsWith('Arrow')) {
        stop();
        setSelectedId(doc.root.id);
      }
      return;
    }

    switch (key) {
      case 'Tab':
        stop();
        createChild(id);
        return;
      case 'Enter':
        stop();
        if (event.shiftKey) createSibling(id, true);
        else createSibling(id);
        return;
      case 'F2':
      case ' ':
        stop();
        startEdit(id);
        return;
      case 'Delete':
      case 'Backspace':
        stop();
        deleteNode(id);
        return;
      case 'ArrowUp':
        stop();
        if (mod) commit(shiftNode(doc, id, -1), id);
        else navigate('up');
        return;
      case 'ArrowDown':
        stop();
        if (mod) commit(shiftNode(doc, id, 1), id);
        else navigate('down');
        return;
      case 'ArrowLeft':
        stop();
        if (mod) commit(layout?.boxes[id]?.side === 'L' ? indentNode(doc, id) : outdentNode(doc, id), id);
        else navigate('left');
        return;
      case 'ArrowRight':
        stop();
        if (mod) commit(layout?.boxes[id]?.side === 'L' ? outdentNode(doc, id) : indentNode(doc, id), id);
        else navigate('right');
        return;
      case '\\':
      case '/':
        stop();
        commit(toggleCollapse(doc, id), id);
        return;
      default:
        break;
    }

    if (/^[1-7]$/.test(key)) {
      stop();
      patch(id, { priority: Number(key) });
      return;
    }
    if (key === '0') {
      stop();
      patch(id, { priority: undefined });
      return;
    }
    const lower = key.toLowerCase();
    if (lower === 'p') {
      stop();
      cycleProgress(id);
    } else if (lower === 'f') {
      stop();
      cycleFlag(id);
    } else if (lower === 'n') {
      stop();
      openNote(id);
    } else if (lower === 'b') {
      stop();
      commit(toggleBoundary(doc, id), id);
    } else if (lower === 's') {
      stop();
      commit(toggleSummary(doc, id), id);
    } else if (lower === 'l') {
      stop();
      startRelation(id);
    }
  };

  const onEditKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      finishEdit({ then: 'sibling' });
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      finishEdit({ then: 'child' });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finishEdit();
    }
  };

  /* —— 指针：按下即选中，移动才算拖拽 —— */
  const onNodePointerDown = (event: React.PointerEvent, id: string) => {
    if (editingId === id || event.button !== 0) return;

    // 联系线模式：这一下点的是终点
    if (linkFrom && linkFrom !== id) {
      commit(addRelation(doc, linkFrom, id), id);
      setLinkFrom(null);
      focusStage();
      return;
    }

    setSelectedId(id);
    setSelectedDeco(null);
    setNotePeek(null);
    focusStage();
    if (id === doc.root.id) return; // 中心主题不参与拖拽
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setDrag({ id, x: event.clientX, y: event.clientY, moved: false });
  };

  const hitTest = (clientX: number, clientY: number, dragId: string) => {
    if (!layout || !stageRef.current) return undefined;
    const rect = stageRef.current.getBoundingClientRect();
    // 画布可能有缩放，把屏幕像素折算回布局坐标
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;
    const forbidden = new Set(subtreeIds(nodeIndex.get(dragId)!.node));
    let best: { target: string; mode: DropMode } | undefined;
    Object.values(layout.boxes).forEach((box) => {
      if (forbidden.has(box.id)) return;
      if (x < box.x - 6 || x > box.x + box.w + 6) return;
      if (y < box.y - 8 || y > box.y + box.h + 8) return;
      const ratio = (y - box.y) / Math.max(1, box.h);
      let mode: DropMode = 'child';
      if (box.id !== doc.root.id) {
        if (ratio < 0.28) mode = 'before';
        else if (ratio > 0.72) mode = 'after';
      }
      best = { target: box.id, mode };
    });
    return best;
  };

  const onNodePointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.abs(event.clientX - drag.x) > 4 || Math.abs(event.clientY - drag.y) > 4;
    if (!moved) return;
    const hit = hitTest(event.clientX, event.clientY, drag.id);
    setDrag({ ...drag, moved: true, target: hit?.target, mode: hit?.mode });
  };

  const onNodePointerUp = (event: React.PointerEvent, _id: string) => {
    if (!drag) return;
    const state = drag;
    setDrag(null);
    if (!state.moved) return;
    event.stopPropagation();
    if (state.target && state.mode) commit(moveNode(doc, state.id, state.target, state.mode), state.id);
  };

  const dropIndicator = (() => {
    if (!drag?.moved || !drag.target || !drag.mode || !layout) return null;
    const box = layout.boxes[drag.target];
    if (!box) return null;
    if (drag.mode === 'child') {
      return <div className="mmap-drop mmap-drop--child" style={{ transform: `translate(${box.x - 4}px, ${box.y - 4}px)`, width: box.w + 8, height: box.h + 8 }} />;
    }
    const y = drag.mode === 'before' ? box.y - 3 : box.y + box.h + 1;
    return <div className="mmap-drop mmap-drop--order" style={{ transform: `translate(${box.x}px, ${y}px)`, width: box.w }} />;
  })();

  const zoomBoxStyle = layout
    ? { width: layout.width * zoom, height: layout.height * zoom }
    : { width: '100%', height: 220 };

  const stageStyle = layout
    ? {
        width: layout.width,
        height: layout.height,
        transform: zoom !== 1 ? `scale(${zoom})` : undefined,
        transformOrigin: 'top left',
      }
    : { width: '100%', height: 220 };

  const peekNode = notePeek ? nodeIndex.get(notePeek)?.node : undefined;
  const peekBox = notePeek && layout ? layout.boxes[notePeek] : undefined;

  return (
    <div
      ref={rootRef}
      className={`mmap${focused ? ' is-focused' : ''}${fullscreen ? ' is-fullscreen' : ''}`}
      contentEditable={false}
      onContextMenu={openCanvasContextMenu}
    >
      <div className="mmap__bar">
        <span className="mmap__title">思维导图</span>
        <span className="mmap__spacer" />
        {selected && (
          <>
            <BarBtn title="子节点 (Tab)" onClick={() => createChild(selected.id)}><Plus /></BarBtn>
            <BarBtn title="同级 (Enter)" onClick={() => createSibling(selected.id)}><Braces /></BarBtn>
            <BarBtn title="编辑 (F2)" onClick={() => startEdit(selected.id)}><Pencil /></BarBtn>
            <BarBtn title="备注 (N)" onClick={() => openNote(selected.id)}><StickyNote /></BarBtn>
            <BarBtn title="外框 (B)" onClick={() => commit(toggleBoundary(doc, selected.id), selected.id)}><Frame /></BarBtn>
            <BarBtn
              title="联系线 (L)：再点一个节点作为终点"
              active={Boolean(linkFrom)}
              onClick={() => startRelation(selected.id)}
            >
              <Link2 />
            </BarBtn>
            <BarBtn title="删除子树 (Delete)" onClick={() => deleteNode(selected.id)} disabled={selected.id === doc.root.id}>
              <Trash2 />
            </BarBtn>
            <BarBtn title="装饰面板" active={inspector} onClick={() => setInspector((v) => !v)}><ImageIcon /></BarBtn>
          </>
        )}
        <span className="mmap__zoomctl">
          <BarBtn title="缩小（Ctrl+滚轮）" onClick={() => zoomBy(1 / 1.2)}><ZoomOut /></BarBtn>
          <button type="button" className="mmap__zoomlabel" title="恢复 100%" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <BarBtn title="放大（Ctrl+滚轮）" onClick={() => zoomBy(1.2)}><ZoomIn /></BarBtn>
          <BarBtn title="适应窗口" onClick={fitView}><Scan /></BarBtn>
        </span>
        {onEnterFullscreen && !fullscreen && (
          <BarBtn title="专注编辑（全屏）" onClick={onEnterFullscreen}><Maximize2 /></BarBtn>
        )}
        {fullscreen && onExitFullscreen && (
          <BarBtn title="退出专注编辑" onClick={onExitFullscreen}><Minimize2 /></BarBtn>
        )}
        <BarBtn title="快捷键" active={hints} onClick={() => setHints((v) => !v)}><Keyboard /></BarBtn>
        {onToggleSource && (
          <button type="button" className={`mmap__srcbtn${sourceVisible ? ' is-active' : ''}`} onClick={onToggleSource}>
            源码
          </button>
        )}
      </div>

      {hints && (
        <div className="mmap__hints">
          <span><b>Tab</b> 子节点</span>
          <span><b>Enter</b> 同级</span>
          <span><b>F2 / 空格 / 双击</b> 编辑</span>
          <span><b>Delete</b> 删除子树</span>
          <span><b>方向键</b> 走位</span>
          <span><b>Alt+↑↓</b> 换顺序</span>
          <span><b>Alt+←→</b> 升降级</span>
          <span><b>\</b> 折叠</span>
          <span><b>1-7</b> 优先级</span>
          <span><b>P</b> 进度</span>
          <span><b>F</b> 旗标</span>
          <span><b>N</b> 备注</span>
          <span><b>B</b> 外框</span>
          <span><b>S</b> 概要</span>
          <span><b>L</b> 联系线</span>
          <span>拖到节点上 = 换父节点，拖到上下边缘 = 换顺序</span>
          <span><b>Ctrl+滚轮</b> 缩放画布</span>
        </div>
      )}

      {linkFrom && <div className="mmap__mode">联系线：点一个节点作为终点，Esc 取消</div>}

      <div className="mmap__scroll" ref={scrollRef}>
        <div className="mmap__zoombox" style={zoomBoxStyle}>
        <div
          className="mmap__stage"
          ref={stageRef}
          tabIndex={0}
          style={stageStyle}
          onKeyDown={onStageKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              if (editingId) finishEdit();
              setSelectedId('');
              setSelectedDeco(null);
              setNotePeek(null);
            }
          }}
        >
          {layout && (
            <svg className="mmap__links" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
              {layout.boundaries.map((b) => (
                <g key={b.id} className={`mmap-boundary${selectedDeco?.id === b.id ? ' is-selected' : ''}`}
                   onMouseDown={(e) => { e.stopPropagation(); setSelectedDeco({ kind: 'boundary', id: b.id }); setInspector(true); }}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={14} />
                  {b.label && <text x={b.x + 10} y={b.y + 14}>{b.label}</text>}
                </g>
              ))}
              {layout.links.map((link) => (
                <path key={link.id} className="mmap-link" d={link.d} strokeWidth={link.width} />
              ))}
              {layout.summaries.map((s) => (
                <g key={s.id} className={`mmap-summary${selectedDeco?.id === s.id ? ' is-selected' : ''}`}
                   onMouseDown={(e) => { e.stopPropagation(); setSelectedDeco({ kind: 'summary', id: s.id }); setInspector(true); }}>
                  <path d={s.d} />
                </g>
              ))}
              {layout.relations.map((r) => (
                <g key={r.id} className={`mmap-relation${selectedDeco?.id === r.id ? ' is-selected' : ''}`}
                   onMouseDown={(e) => { e.stopPropagation(); setSelectedDeco({ kind: 'relation', id: r.id }); setInspector(true); }}>
                  <path className="mmap-relation__hit" d={r.d} />
                  <path className="mmap-relation__line" d={r.d} />
                  <path className="mmap-relation__arrow" d={r.arrow} />
                  {r.label && <text x={r.labelX} y={r.labelY}>{r.label}</text>}
                </g>
              ))}
            </svg>
          )}

          {layout?.summaries.map((s) => (
            <div
              key={s.id}
              ref={(el) => { if (el) summaryRefs.current.set(s.id, el); else summaryRefs.current.delete(s.id); }}
              className={`mmap-summary__label${s.side === 'L' ? ' is-left' : ''}`}
              style={{ transform: `translate(${s.labelX}px, ${s.labelY}px)${s.side === 'L' ? ' translateX(-100%)' : ''}` }}
              onMouseDown={(e) => { e.stopPropagation(); setSelectedDeco({ kind: 'summary', id: s.id }); setInspector(true); }}
            >
              {s.label}
            </div>
          ))}

          {visibleNodes.map(({ node, depth }) => {
            const box = layout?.boxes[node.id];
            const side: Side = box?.side ?? 'R';
            const isEditing = editingId === node.id;
            const kind = depth === 0 ? 'root' : depth === 1 ? 'branch' : 'leaf';
            const classes = [
              'mmap-node',
              `mmap-node--${kind}`,
              side === 'L' ? 'is-left' : 'is-right',
              selectedId === node.id ? 'is-selected' : '',
              isEditing ? 'is-editing' : '',
              drag?.moved && drag.id === node.id ? 'is-dragging' : '',
              linkFrom === node.id ? 'is-linksource' : '',
            ].filter(Boolean).join(' ');

            return (
              <div
                key={node.id}
                ref={(el) => { if (el) nodeRefs.current.set(node.id, el); else nodeRefs.current.delete(node.id); }}
                className={classes}
                style={box ? { transform: `translate(${box.x}px, ${box.y}px)` } : { visibility: 'hidden' }}
                onPointerDown={(e) => onNodePointerDown(e, node.id)}
                onPointerMove={onNodePointerMove}
                onPointerUp={(e) => onNodePointerUp(e, node.id)}
                onDoubleClick={(e) => { e.stopPropagation(); startEdit(node.id); }}
                onContextMenu={(e) => openNodeContextMenu(e, node.id)}
              >
                {node.image && <img className="mmap-node__img" src={node.image} alt="" draggable={false} />}
                <div className="mmap-node__row">
                  {node.priority && (
                    <span className="mmap-node__pri" style={{ background: PRIORITY_COLORS[node.priority - 1] }}>{node.priority}</span>
                  )}
                  {typeof node.progress === 'number' && <ProgressRing value={node.progress} />}
                  {node.flag && <FlagIcon flag={node.flag} />}
                  {isEditing ? (
                    <div
                      ref={editRef}
                      className="mmap-node__edit"
                      contentEditable
                      suppressContentEditableWarning
                      onInput={relayout}
                      onKeyDown={onEditKeyDown}
                      onBlur={() => finishEdit()}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="mmap-node__label">{node.label || '未命名'}</span>
                  )}
                  {node.note && (
                    <button
                      type="button"
                      className="mmap-node__badge"
                      title="备注"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setNotePeek(notePeek === node.id ? null : node.id); }}
                    >
                      <StickyNote />
                    </button>
                  )}
                  {node.link && (
                    <button
                      type="button"
                      className="mmap-node__badge"
                      title={node.link}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); window.open(node.link, '_blank'); }}
                    >
                      <Link2 />
                    </button>
                  )}
                </div>
                {node.children.length > 0 && (
                  <button
                    type="button"
                    className="mmap-node__toggle"
                    title={node.collapsed ? '展开' : '折叠'}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); commit(toggleCollapse(doc, node.id), node.id); }}
                  >
                    {node.collapsed ? node.children.length : '–'}
                  </button>
                )}
                {!isEditing && (
                  <div className="mmap-node__quick">
                    <button
                      type="button"
                      title="新建子节点"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); createChild(node.id); }}
                    >
                      <Plus />
                    </button>
                    {node.id !== doc.root.id && (
                      <button
                        type="button"
                        title="新建同级节点"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); createSibling(node.id); }}
                      >
                        <Braces />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {dropIndicator}

          {peekNode && peekBox && (
            <div className="mmap-note" style={{ transform: `translate(${peekBox.x}px, ${peekBox.y + peekBox.h + 8}px)` }}>
              <button type="button" className="mmap-note__close" onClick={() => setNotePeek(null)}><X /></button>
              <div className="mmap-note__body">{peekNode.note}</div>
            </div>
          )}
        </div>
        </div>
      </div>

      {ctxMenu?.kind === 'node' && (
        <div
          className="mmap-ctxmenu"
          style={{ transform: `translate(${ctxMenu.x}px, ${ctxMenu.y}px)` }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            onClick={() => { setCtxMenu(null); startEdit(ctxMenu.id); }}
          >
            编辑<span className="mmap-ctxmenu__key">F2</span>
          </button>
          <button
            type="button"
            onClick={() => { setCtxMenu(null); createChild(ctxMenu.id); }}
          >
            新建子节点<span className="mmap-ctxmenu__key">Tab</span>
          </button>
          <button
            type="button"
            disabled={ctxMenu.id === doc.root.id}
            onClick={() => { setCtxMenu(null); createSibling(ctxMenu.id); }}
          >
            新建同级节点<span className="mmap-ctxmenu__key">Enter</span>
          </button>
          <div className="mmap-ctxmenu__sep" />
          <button
            type="button"
            className="is-danger"
            disabled={ctxMenu.id === doc.root.id}
            onClick={() => { setCtxMenu(null); deleteNode(ctxMenu.id); }}
          >
            删除子树<span className="mmap-ctxmenu__key">Delete</span>
          </button>
          {onDeleteBlock && (
            <button
              type="button"
              className="is-danger"
              onClick={() => { setCtxMenu(null); onDeleteBlock(); }}
            >
              删除整个思维导图
            </button>
          )}
        </div>
      )}

      {ctxMenu?.kind === 'canvas' && (
        <div
          className="mmap-ctxmenu"
          style={{ transform: `translate(${ctxMenu.x}px, ${ctxMenu.y}px)` }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {onToggleSource && (
            <button
              type="button"
              onClick={() => { setCtxMenu(null); onToggleSource(); }}
            >
              {sourceVisible ? '隐藏源码' : '查看源码'}
            </button>
          )}
          {onToggleSource && onDeleteBlock && <div className="mmap-ctxmenu__sep" />}
          <button
            type="button"
            className="is-danger"
            disabled={!onDeleteBlock}
            onClick={() => { setCtxMenu(null); onDeleteBlock?.(); }}
          >
            删除整个思维导图
          </button>
        </div>
      )}

      {inspector && (
        <Inspector
          doc={doc}
          node={selected}
          deco={selectedDeco}
          noteRef={noteInputRef}
          onPatch={patch}
          onCommit={commit}
          onClose={() => setInspector(false)}
        />
      )}
    </div>
  );
}

/* ── 小组件 ───────────────────────────────────────────────────────────── */

function BarBtn({ title, onClick, children, active, disabled }: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={`mmap__btn${active ? ' is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FlagIcon({ flag }: { flag: MindFlag }) {
  const Icon = FLAG_ICONS[flag];
  return <span className={`mmap-node__flag mmap-node__flag--${flag}`} title={FLAG_LABELS[flag]}><Icon /></span>;
}

function ProgressRing({ value }: { value: number }) {
  const r = 5;
  const c = 2 * Math.PI * r;
  return (
    <span className="mmap-node__progress" title={`进度 ${value}%`}>
      <svg viewBox="0 0 14 14" width="13" height="13">
        <circle cx="7" cy="7" r={r} fill="none" stroke="rgba(58,52,43,0.22)" strokeWidth="2" />
        <circle
          cx="7" cy="7" r={r} fill="none" stroke="#448361" strokeWidth="2" strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`} transform="rotate(-90 7 7)"
        />
      </svg>
    </span>
  );
}

function Inspector({ doc, node, deco, noteRef, onPatch, onCommit, onClose }: {
  doc: MindDoc;
  node?: MindNode;
  deco: DecoRef | null;
  noteRef: React.RefObject<HTMLTextAreaElement>;
  onPatch: (id: string, values: Partial<Omit<MindNode, 'id' | 'children'>>) => void;
  onCommit: (doc: MindDoc, select?: string) => void;
  onClose: () => void;
}) {
  const decoItem = deco
    ? (deco.kind === 'relation'
      ? doc.relations.find((r) => r.id === deco.id)
      : deco.kind === 'boundary'
        ? doc.boundaries.find((b) => b.id === deco.id)
        : doc.summaries.find((s) => s.id === deco.id)) as { id: string; label?: string } | undefined
    : undefined;

  const removeDeco = () => {
    if (!deco) return;
    const next = cloneDoc(doc);
    if (deco.kind === 'relation') next.relations = next.relations.filter((r) => r.id !== deco.id);
    if (deco.kind === 'boundary') next.boundaries = next.boundaries.filter((b) => b.id !== deco.id);
    if (deco.kind === 'summary') next.summaries = next.summaries.filter((s) => s.id !== deco.id);
    onCommit(next);
  };

  if (deco && decoItem) {
    const kindLabel = deco.kind === 'relation' ? '联系线' : deco.kind === 'boundary' ? '外框' : '概要';
    return (
      <div className="mmap__panel">
        <div className="mmap__panel-head">
          <span>{kindLabel}</span>
          <span className="mmap__spacer" />
          <button type="button" className="mmap__btn" title="删除" onClick={removeDeco}><Trash2 /></button>
          <button type="button" className="mmap__btn" title="收起面板" onClick={onClose}><X /></button>
        </div>
        <label className="mmap__field">
          <span>文字</span>
          <input
            type="text"
            value={decoItem.label ?? ''}
            placeholder={deco.kind === 'summary' ? '概要' : '可留空'}
            onChange={(e) => onCommit(updateDeco(doc, deco.kind, deco.id, e.target.value))}
          />
        </label>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="mmap__panel">
        <div className="mmap__panel-head">
          <span>装饰</span>
          <span className="mmap__spacer" />
          <button type="button" className="mmap__btn" title="收起面板" onClick={onClose}><X /></button>
        </div>
        <div className="mmap__panel-empty">先选一个节点</div>
      </div>
    );
  }

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (event: any) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      try {
        const { url } = await uploadImage(file);
        onPatch(node.id, { image: url });
      } catch (err) {
        console.error('思维导图配图上传失败', err);
      }
    };
    input.click();
  };

  const hasBoundary = doc.boundaries.some((b) => b.target === node.id);
  const hasSummary = doc.summaries.some((s) => s.target === node.id);

  return (
    <div className="mmap__panel">
      <div className="mmap__panel-head">
        <span>「{node.label || '未命名'}」的装饰</span>
        <span className="mmap__spacer" />
        <button type="button" className="mmap__btn" title="收起面板" onClick={onClose}><X /></button>
      </div>

      <div className="mmap__field">
        <span>优先级</span>
        <div className="mmap__chips">
          {[1, 2, 3, 4, 5, 6, 7].map((p) => (
            <button
              key={p}
              type="button"
              className={`mmap__chip${node.priority === p ? ' is-active' : ''}`}
              style={node.priority === p ? { background: PRIORITY_COLORS[p - 1], color: '#fff', borderColor: 'transparent' } : undefined}
              onClick={() => onPatch(node.id, { priority: node.priority === p ? undefined : p })}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mmap__field">
        <span>进度</span>
        <div className="mmap__chips">
          {PROGRESS_STEPS.map((v) => (
            <button
              key={v}
              type="button"
              className={`mmap__chip${node.progress === v ? ' is-active' : ''}`}
              onClick={() => onPatch(node.id, { progress: node.progress === v ? undefined : v })}
            >
              {v}%
            </button>
          ))}
        </div>
      </div>

      <div className="mmap__field">
        <span>标记</span>
        <div className="mmap__chips">
          {MIND_FLAGS.map((flag) => {
            const Icon = FLAG_ICONS[flag];
            return (
              <button
                key={flag}
                type="button"
                title={FLAG_LABELS[flag]}
                className={`mmap__chip mmap__chip--icon${node.flag === flag ? ' is-active' : ''}`}
                onClick={() => onPatch(node.id, { flag: node.flag === flag ? undefined : flag })}
              >
                <Icon />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mmap__field">
        <span>成组</span>
        <div className="mmap__chips">
          <button
            type="button"
            className={`mmap__chip${hasBoundary ? ' is-active' : ''}`}
            onClick={() => onCommit(toggleBoundary(doc, node.id), node.id)}
          >
            外框
          </button>
          <button
            type="button"
            className={`mmap__chip${hasSummary ? ' is-active' : ''}`}
            onClick={() => onCommit(toggleSummary(doc, node.id), node.id)}
          >
            概要
          </button>
        </div>
      </div>

      <label className="mmap__field">
        <span>链接</span>
        <input
          type="text"
          value={node.link ?? ''}
          placeholder="https://"
          onChange={(e) => onPatch(node.id, { link: e.target.value })}
        />
      </label>

      <div className="mmap__field">
        <span>配图</span>
        <div className="mmap__chips mmap__chips--grow">
          <input
            type="text"
            value={node.image ?? ''}
            placeholder="/blog-assets/…"
            onChange={(e) => onPatch(node.id, { image: e.target.value })}
          />
          <button type="button" className="mmap__chip" onClick={pickImage}>上传</button>
        </div>
      </div>

      <label className="mmap__field mmap__field--note">
        <span>备注</span>
        <textarea
          ref={noteRef}
          rows={3}
          value={node.note ?? ''}
          placeholder="点开才显示的长文本，主干保持简洁"
          onChange={(e) => onPatch(node.id, { note: e.target.value })}
        />
      </label>
    </div>
  );
}
