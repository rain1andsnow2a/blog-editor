import assert from 'node:assert/strict';
import {
  addChild, addSibling, moveNode, parseMindmapDoc, removeNode, serializeMindmapDoc,
  toggleBoundary, toggleCollapse, toggleSummary, addRelation, findNode, updateNode,
} from '../src/lib/mindmapModel';
import { layoutMindmap, type MMSizes } from '../src/lib/mindmapLayout';

/* 1. 旧格式往返不变 */
const legacy = ['中心主题', '  第一条分支', '    要点一', '    要点二', '  第二条分支', '    要点三'].join('\n');
const legacyDoc = parseMindmapDoc(legacy);
assert.equal(serializeMindmapDoc(legacyDoc), legacy, '旧格式往返应该逐字不变');
assert.equal(legacyDoc.root.children.length, 2);
assert.equal(legacyDoc.root.children[0].children[1].label, '要点二');

/* 2. 元数据解析 + 往返 */
const rich = [
  '主题',
  '  分支 {p1 60% flag=star collapsed link=https://x.dev note="第一行\\n第二行"}',
  '    子',
].join('\n');
const richDoc = parseMindmapDoc(rich);
const branch = richDoc.root.children[0];
assert.equal(branch.label, '分支');
assert.equal(branch.priority, 1);
assert.equal(branch.progress, 60);
assert.equal(branch.flag, 'star');
assert.equal(branch.collapsed, true);
assert.equal(branch.link, 'https://x.dev');
assert.equal(branch.note, '第一行\n第二行');
assert.equal(serializeMindmapDoc(richDoc), rich, '元数据往返应该稳定');

/* 3. 认不出来的花括号原样留在标签里（老文章不会被吃字） */
const literal = parseMindmapDoc('主题\n  函数 {a: 1}');
assert.equal(literal.root.children[0].label, '函数 {a: 1}');
assert.equal(serializeMindmapDoc(literal), '主题\n  函数 {a: 1}');

/* 4. 指令区：外框 / 概要 / 联系线 */
let doc = parseMindmapDoc(legacy);
const first = doc.root.children[0];
const second = doc.root.children[1];
doc = toggleBoundary(doc, first.id, '第一阶段');
doc = toggleSummary(doc, first.id, '汇总');
doc = addRelation(doc, first.children[0].id, second.id, '相关');
const text = serializeMindmapDoc(doc);
assert.ok(text.includes('---'), '有装饰时要写出指令区');
const reparsed = parseMindmapDoc(text);
assert.equal(reparsed.boundaries.length, 1);
assert.equal(reparsed.summaries[0].label, '汇总');
assert.equal(reparsed.relations[0].label, '相关');
assert.equal(serializeMindmapDoc(reparsed), text, '带装饰的往返也要稳定');

/* 5. 树操作 */
let ops = parseMindmapDoc(legacy);
const child = addChild(ops, ops.root.children[0].id, '新子节点');
ops = child.doc;
assert.equal(findNode(ops, child.selectId)?.label, '新子节点');
const sibling = addSibling(ops, child.selectId, '新同级');
ops = sibling.doc;
assert.equal(ops.root.children[0].children.length, 4);

// 删除会带走整棵子树
const before = ops.root.children[0].children.length;
const removed = removeNode(ops, ops.root.children[0].children[0].id);
assert.equal(removed.doc.root.children[0].children.length, before - 1);

// 重新挂载：把第一条分支挂到第二条分支下
const moved = moveNode(ops, ops.root.children[0].id, ops.root.children[1].id, 'child');
assert.equal(moved.root.children.length, 1);
assert.equal(moved.root.children[0].children.at(-1)?.label, '第一条分支');

// 不能挂到自己的子孙下面
const cyclic = moveNode(ops, ops.root.children[0].id, ops.root.children[0].children[0].id, 'child');
assert.equal(cyclic, ops, '成环的拖拽必须被拒绝');

// 根节点不能删、不能拖
assert.equal(removeNode(ops, ops.root.id).doc, ops);
assert.equal(moveNode(ops, ops.root.id, ops.root.children[0].id, 'child'), ops);

/* 6. 布局：任意深度都有独立盒子，兄弟之间不重叠 */
let deep = parseMindmapDoc(['主题', '  A', '    A1', '      A1a', '        A1a1', '  B', '    B1', '  C'].join('\n'));
deep = updateNode(deep, deep.root.id, { label: '主题' });
const sizes: MMSizes = {};
const collect = (node: any) => {
  sizes[node.id] = { w: 20 + node.label.length * 14, h: 30 };
  node.children.forEach(collect);
};
collect(deep.root);

const result = layoutMindmap(deep, sizes);
const ids = Object.keys(result.boxes);
assert.equal(ids.length, 8, '八个节点都要有坐标，深层节点不能被压平');
assert.ok(result.width > 0 && result.height > 0);
Object.values(result.boxes).forEach((box) => {
  assert.ok(box.x >= 0 && box.y >= 0, `${box.id} 不能落在画布外: ${box.x},${box.y}`);
  assert.ok(box.x + box.w <= result.width + 0.5, `${box.id} 超出右边界`);
  assert.ok(box.y + box.h <= result.height + 0.5, `${box.id} 超出下边界`);
});

// 同一父节点下的兄弟不能重叠
const overlap = (a: any, b: any) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const boxes = Object.values(result.boxes);
for (let i = 0; i < boxes.length; i += 1) {
  for (let j = i + 1; j < boxes.length; j += 1) {
    assert.ok(!overlap(boxes[i], boxes[j]), `${boxes[i].id} 和 ${boxes[j].id} 重叠了`);
  }
}
assert.equal(result.links.length, 7, '每条父子关系一条连线');

// 折叠后子树消失，连线也少了
const folded = toggleCollapse(deep, deep.root.children[0].id);
const foldedLayout = layoutMindmap(folded, sizes);
assert.equal(Object.keys(foldedLayout.boxes).length, 5, '折叠 A 应该藏掉 A1/A1a/A1a1 三个节点');

// 左右分侧：奇偶交替，新增分支不会让老分支跳侧
assert.equal(result.boxes[deep.root.children[0].id].side, 'R');
assert.equal(result.boxes[deep.root.children[1].id].side, 'L');
assert.equal(result.boxes[deep.root.children[2].id].side, 'R');

console.log('mindmap model + layout: 所有断言通过');

/* 7. 静态渲染器（博客共用的那份）能吃下新格式 */
const { parseMindmap } = await import('../src/lib/mindmap');
const decorated = [
  '中心主题',
  '  第一条分支 {#a p1 60% note="备注在这里 有空格" collapsed}',
  '    要点一 {link=https://x.dev}',
  '  第二条分支 {#b}',
  '---',
  'boundary a : 第一阶段',
  'summary a : 汇总',
  'rel a -> b : 相关',
].join('\n');
const staticTree = parseMindmap(decorated);
assert.equal(staticTree.label, '中心主题');
assert.equal(staticTree.children.length, 2, '指令区不能被当成第二个中心主题');
assert.equal(staticTree.children[0].label, '第一条分支', '元数据不能漏进标签');
assert.equal(staticTree.children[0].children[0].label, '要点一');
assert.equal(staticTree.children[1].label, '第二条分支');
assert.equal(parseMindmap('主题\n  函数 {a: 1}').children[0].label, '函数 {a: 1}', '认不出的花括号要留着');
console.log('静态渲染器兼容新格式：通过');
