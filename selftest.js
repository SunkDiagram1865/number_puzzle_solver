'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (C) 2026  number-puzzle-solver contributors
//
// 本文件是「数字华容道求解器」的一部分。
// 它是自由软件，遵循 GNU 通用公共许可证第 3 版或更高版本；
// 本程序不提供任何担保。详见项目根目录下的 LICENSE 文件。
//
// 验证 number-puzzle-solver.html 中求解器的正确性：
//   1) 3x3：与 BFS 全图精确距离逐一比对
//   2) 4x4：与 A*（曼哈顿+线性冲突，可采纳启发式 → 最优）比对
//   3) 所有返回的解法都必须能真正还原到目标局面

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'number-puzzle-solver.html'), 'utf8');
const open = '<script id="solver-src" type="text/js-worker">';
const i0 = html.indexOf(open);
if (i0 < 0) throw new Error('找不到 solver 源码块');
const i1 = html.indexOf('</script>', i0);
const src = html.slice(i0 + open.length, i1);

const solvePuzzle = new Function(src + '\nreturn solvePuzzle;')();

// ---------------- 公共工具 ----------------
function keyOf(b) {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
function goalBoard(n) {
  const T = n * n, b = new Array(T);
  for (let i = 0; i < T - 1; i++) b[i] = i + 1;
  b[T - 1] = 0;
  return b;
}
function neighbors(b, n) {
  const T = b.length, blank = b.indexOf(0);
  const r = (blank / n) | 0, c = blank % n;
  const out = [];
  const push = (p) => { const nb = b.slice(); nb[blank] = nb[p]; nb[p] = 0; out.push(nb); };
  if (r > 0) push(blank - n);
  if (r < n - 1) push(blank + n);
  if (c > 0) push(blank - 1);
  if (c < n - 1) push(blank + 1);
  return out;
}
function scramble(n, depth) {
  let b = goalBoard(n);
  let last = -1;
  for (let i = 0; i < depth; i++) {
    const blank = b.indexOf(0);
    const cand = neighbors(b, n).filter((nb) => nb.indexOf(0) !== last);
    const pick = cand[(Math.random() * cand.length) | 0];
    last = b.indexOf(0);
    b = pick;
  }
  return b;
}
function applyMoves(board, moves, n) {
  const b = board.slice();
  for (const mv of moves) {
    if (b[mv.from] !== mv.tile) return { ok: false, why: `第 ${mv.from} 格不是 ${mv.tile}` };
    if (b[mv.to] !== 0) return { ok: false, why: `目标格 ${mv.to} 不是空格` };
    b[mv.to] = mv.tile;
    b[mv.from] = 0;
  }
  return { ok: true, board: b };
}
function isGoal(b, n) {
  const g = goalBoard(n);
  for (let i = 0; i < b.length; i++) if (b[i] !== g[i]) return false;
  return true;
}
function invCount(b) {
  const t = b.filter((v) => v !== 0);
  let inv = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[i] > t[j]) inv++;
  return inv;
}
function isSolvable(board, n) {
  const inv = invCount(board);
  if (n % 2 === 1) return inv % 2 === 0;
  const blankRowFromBottom = n - Math.floor(board.indexOf(0) / n);
  return (inv + blankRowFromBottom) % 2 === 1;
}

// ---------------- 参考：BFS 精确距离（3x3） ----------------
function bfsDistances(n) {
  const g = goalBoard(n);
  const dist = new Map();
  dist.set(keyOf(g), 0);
  let frontier = [g];
  while (frontier.length) {
    const next = [];
    for (const b of frontier) {
      const d = dist.get(keyOf(b));
      for (const nb of neighbors(b, n)) {
        const k = keyOf(nb);
        if (!dist.has(k)) { dist.set(k, d + 1); next.push(nb); }
      }
    }
    frontier = next;
  }
  return dist;
}

// ---------------- 参考：A*（曼哈顿 + 线性冲突，可采纳 → 最优） ----------------
function makeHeuristic(n) {
  const T = n * n;
  const gr = new Int8Array(T + 1), gc = new Int8Array(T + 1);
  for (let v = 1; v < T; v++) { gr[v] = Math.floor((v - 1) / n); gc[v] = (v - 1) % n; }
  const manh = new Uint8Array((T + 1) * T);
  for (let v = 1; v < T; v++) {
    const base = v * T;
    for (let p = 0; p < T; p++) {
      manh[base + p] = Math.abs(gr[v] - Math.floor(p / n)) + Math.abs(gc[v] - (p % n));
    }
  }
  return function h(b) {
    let s = 0;
    for (let p = 0; p < T; p++) { const v = b[p]; if (v) s += manh[v * T + p]; }
    const seq = [];
    for (let r = 0; r < n; r++) {
      seq.length = 0;
      for (let c = 0; c < n; c++) { const v = b[r * n + c]; if (v && gr[v] === r) seq.push(gc[v]); }
      for (let i = 1; i < seq.length; i++) for (let j = 0; j < i; j++) if (seq[j] > seq[i]) s += 2;
    }
    for (let c = 0; c < n; c++) {
      seq.length = 0;
      for (let r = 0; r < n; r++) { const v = b[r * n + c]; if (v && gc[v] === c) seq.push(gr[v]); }
      for (let i = 1; i < seq.length; i++) for (let j = 0; j < i; j++) if (seq[j] > seq[i]) s += 2;
    }
    return s;
  };
}

function astarOptimal(start, n, h) {
  const T = n * n;
  const goalKey = keyOf(goalBoard(n));
  const gScore = new Map();
  const startKey = keyOf(start);
  gScore.set(startKey, 0);

  // 二叉堆
  const heap = [];
  const push = (node) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  push({ f: h(start), g: 0, b: start });
  let expanded = 0;
  while (heap.length) {
    const node = pop();
    const k = keyOf(node.b);
    if (node.g > (gScore.get(k) ?? Infinity)) continue;
    if (k === goalKey) return { steps: node.g, expanded };
    if (++expanded > 4000000) return { steps: -1, expanded };
    for (const nb of neighbors(node.b, n)) {
      const nk = keyOf(nb);
      const ng = node.g + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        push({ f: ng + h(nb), g: ng, b: nb });
      }
    }
  }
  return { steps: -1, expanded };
}

// ---------------- 开始测试 ----------------
let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('  ✗ ' + msg); }
}

console.log('=== 测试 1：3x3 与 BFS 精确最短距离比对 ===');
{
  const n = 3;
  const dist = bfsDistances(n);
  console.log(`  BFS 覆盖状态数：${dist.size}（可达状态应为 181440）`);
  check(dist.size === 181440, 'BFS 状态总数不正确');

  const keys = [...dist.keys()];
  let worst = 0, bad = 0;
  const samples = 60;
  for (let t = 0; t < samples; t++) {
    const k = keys[(Math.random() * keys.length) | 0];
    const b = new Array(9);
    for (let i = 0; i < 9; i++) b[i] = k.charCodeAt(i);
    const truth = dist.get(k);
    const res = solvePuzzle(b, n, { maxMs: 60000 }, null);
    if (!res.ok) { bad++; console.log('  ✗ 求解失败', b, res); continue; }
    if (res.steps !== truth) { bad++; console.log(`  ✗ 步数不符：得到 ${res.steps}，正确 ${truth}`); continue; }
    const ap = applyMoves(b, res.moves, n);
    check(ap.ok && isGoal(ap.board, n), `解法无效（样本 ${k}）`);
    if (res.steps > worst) worst = res.steps;
  }
  console.log(`  ${samples} 个随机状态，最远 ${worst} 步，失败 ${bad} 个`);
  check(bad === 0, '3x3 存在最短步数不符的样本');
}

console.log('\n=== 测试 2：4x4 与 A* 最优解比对 ===');
{
  const n = 4;
  const h = makeHeuristic(n);
  const depths = [10, 16, 22];
  let bad = 0;
  for (const d of depths) {
    const b = scramble(n, d);
    const res = solvePuzzle(b, n, { maxMs: 120000 }, null);
    if (!res.ok) { bad++; console.log('  ✗ 求解失败', b, res); continue; }
    const ap = applyMoves(b, res.moves, n);
    check(ap.ok && isGoal(ap.board, n), `解法无效（打乱 ${d} 步）`);
    const ref = astarOptimal(b, n, h);
    check(ref.steps === res.steps, `步数不符：IDA* ${res.steps} vs A* ${ref.steps}`);
    if (ref.steps !== res.steps) bad++;
    console.log(`  打乱 ${String(d).padStart(2)} 步 → 最优 ${res.steps} 步（A* 校验 ${ref.steps}），节点 ${res.nodes}，耗时 ${res.elapsed}ms`);
  }
  check(bad === 0, '4x4 存在步数不符的样本');
}

console.log('\n=== 测试 3：可解性判断 & 已知最难局面 ===');
{
  // 3x3 全排列中恰好一半可解
  const n = 3;
  let solvableCount = 0;
  const all = [];
  (function perm(arr, cur) {
    if (!arr.length) { all.push(cur); return; }
    for (let i = 0; i < arr.length; i++) {
      perm(arr.slice(0, i).concat(arr.slice(i + 1)), cur.concat(arr[i]));
    }
  })([0, 1, 2, 3, 4, 5, 6, 7, 8], []);
  for (const p of all) if (isSolvable(p, n)) solvableCount++;
  console.log(`  3x3 全排列 ${all.length} 个，判为可解 ${solvableCount} 个（应为 181440）`);
  check(solvableCount === 181440, '可解性判断有误');

  // 经典的 4x4 最难局面之一，理论最少 80 步
  const hardest = [15, 14, 8, 12, 10, 11, 9, 13, 2, 6, 5, 1, 3, 7, 4, 0];
  const r = solvePuzzle(hardest, 4, { maxMs: 300000 }, null);
  if (r.ok) {
    const ap = applyMoves(hardest, r.moves, 4);
    check(ap.ok && isGoal(ap.board, 4), '最难局面解法无效');
    console.log(`  已知最难局面求解：${r.steps} 步（理论最优 80 步），节点 ${r.nodes}，耗时 ${r.elapsed}ms`);
    check(r.steps === 80, '最难局面步数不是 80');
  } else {
    console.log('  ⚠ 最难局面在时限内未求解完：' + r.reason);
  }

  // 已是目标局面
  const z = solvePuzzle(goalBoard(4), 4, {}, null);
  check(z.ok && z.steps === 0, '目标局面应返回 0 步');
}

console.log('\n=== 测试 4：5x5 抽样 ===');
{
  const n = 5;
  const b = scramble(n, 30);
  const t = Date.now();
  const res = solvePuzzle(b, n, { maxMs: 60000 }, null);
  if (res.ok) {
    const ap = applyMoves(b, res.moves, n);
    check(ap.ok && isGoal(ap.board, n), '5x5 解法无效');
    console.log(`  5x5 打乱 30 步 → ${res.steps} 步，节点 ${res.nodes}，耗时 ${Date.now() - t}ms`);
  } else {
    console.log(`  ⚠ 5x5 未在时限内完成：${res.reason}，节点 ${res.nodes}`);
  }
}

console.log('\n' + (failures === 0 ? '✅ 全部测试通过' : `❌ 有 ${failures} 项断言失败`));
process.exit(failures === 0 ? 0 : 1);
