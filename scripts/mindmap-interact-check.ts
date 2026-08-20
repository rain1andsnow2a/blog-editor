/**
 * 交互冒烟测试：证明「键盘驱动」这条链路真的接通了。
 * jsdom 没有排版能力（offsetWidth 恒为 0），布局数值不做断言，只验交互 → 源码。
 *
 * jsdom 没有写进 devDependencies（只有这一个脚本用得上），先装再跑：
 *   npm i -D jsdom
 *   npx tsx scripts/mindmap-interact-check.ts
 */
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
const { window } = dom;
(globalThis as any).window = window;
(globalThis as any).document = window.document;
(globalThis as any).HTMLElement = window.HTMLElement;
(globalThis as any).HTMLInputElement = window.HTMLInputElement;
(globalThis as any).HTMLTextAreaElement = window.HTMLTextAreaElement;
(globalThis as any).Element = window.Element;
(globalThis as any).Node = window.Node;
(globalThis as any).requestAnimationFrame = window.requestAnimationFrame.bind(window);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
window.Element.prototype.setPointerCapture = () => {};
window.Element.prototype.releasePointerCapture = () => {};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const act = (await import('react')).act as (cb: () => Promise<void> | void) => Promise<void>;
const MindmapCanvas = (await import('../src/components/MindmapCanvas')).default;

let latest = '中心主题\n  第一条分支';

function Harness() {
  const [src, setSrc] = React.useState(latest);
  return React.createElement(MindmapCanvas, {
    source: src,
    onChange: (next: string) => {
      latest = next;
      setSrc(next);
    },
  });
}

const container = window.document.getElementById('root')!;
const root = createRoot(container);
await act(async () => {
  root.render(React.createElement(Harness));
});

const q = (selector: string) => container.querySelector(selector) as HTMLElement | null;
const nodeByText = (text: string) =>
  Array.from(container.querySelectorAll('.mmap-node')).find((el) => el.textContent?.includes(text)) as HTMLElement | undefined;

const stage = q('.mmap__stage')!;
/** 编辑中就把按键送给编辑框（真实场景里焦点在那儿），否则送给画布 */
const key = async (k: string, init: any = {}) => {
  const target = q('.mmap-node__edit') || stage;
  await act(async () => {
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  });
};
const clickNode = async (el: HTMLElement) => {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    el.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, button: 0 }));
  });
};
const editing = () => Boolean(q('.mmap-node__edit'));
const typeInto = async (text: string) => {
  assert.ok(editing(), '应该有节点进入编辑状态');
  const edit = q('.mmap-node__edit')!;
  await act(async () => {
    edit.textContent = text;
  });
};

/* 1. 起手：两个节点 */
assert.equal(container.querySelectorAll('.mmap-node').length, 2);

/* 2. 选中中心主题 → Tab 长一层子节点，并直接进入编辑 */
await clickNode(q('.mmap-node--root')!);
assert.equal(container.querySelectorAll('.mmap-node.is-selected').length, 1, '点一下就该选中');
await key('Tab');
assert.ok(editing(), 'Tab 之后新节点应处于编辑状态');

/* 3. 打字 + Enter：提交并平铺一个兄弟，手不离键盘 */
await typeInto('新分支');
await key('Enter');
assert.ok(editing(), 'Enter 应该继续开一个同级节点');
await typeInto('第二个');
await key('Escape');
assert.equal(editing(), false, 'Esc 退出编辑');
assert.equal(latest, '中心主题\n  第一条分支\n  新分支\n  第二个', `源码不对：${JSON.stringify(latest)}`);

/* 4. 编辑中按 Tab：提交并往深处长一层 */
await key('F2');
await typeInto('第二个');
await key('Tab');
await typeInto('孙节点');
await key('Escape');
assert.equal(
  latest,
  '中心主题\n  第一条分支\n  新分支\n  第二个\n    孙节点',
  `Tab 应该往深处长一层：${JSON.stringify(latest)}`,
);

/* 5. 方向键走位 + 折叠 */
await clickNode(nodeByText('第二个')!);
await key('\\');
assert.ok(latest.includes('第二个 {collapsed}'), `折叠状态要写进源码：${JSON.stringify(latest)}`);
assert.ok(!nodeByText('孙节点'), '折叠后子树从视野里消失');await key('\\');
assert.ok(nodeByText('孙节点'), '再按一次展开');

/* 6. 装饰快捷键：优先级 / 进度 / 旗标 / 备注留白 */
await key('1');
await key('p');
await key('f');
assert.ok(/第二个 \{p1 0% flag=flag\}/.test(latest), `装饰要写进源码：${JSON.stringify(latest)}`);

/* 7. 外框与概要 */
await key('b');
await key('s');
assert.ok(latest.includes('---'), '装饰指令区');
assert.ok(/boundary \S+ : /.test(latest) === false && /boundary \S+/.test(latest), '外框指令');
assert.ok(/summary \S+ : 概要/.test(latest), '概要指令');

/* 8. Delete 带走整棵子树 */
await clickNode(nodeByText('第二个')!);
await key('Delete');
assert.ok(!latest.includes('孙节点'), 'Delete 必须把子树一起带走');
assert.ok(!latest.includes('第二个'), 'Delete 删掉自己');
assert.ok(!latest.includes('boundary'), '子树上的装饰跟着消失');
assert.ok(latest.includes('第一条分支') && latest.includes('新分支'), '兄弟节点不受影响');

console.log('交互冒烟测试通过，最终源码：' + JSON.stringify(latest));
