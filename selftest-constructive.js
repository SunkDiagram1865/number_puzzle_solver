'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (C) 2026  number-puzzle-solver contributors
//
// 本文件是「数字华容道求解器」的一部分。
// 它是自由软件，遵循 GNU 通用公共许可证第 3 版或更高版本；
// 本程序不提供任何担保。详见项目根目录下的 LICENSE 文件。
//
// 验证构造法求解器（solveConstructive）在 2x2 ~ 8x8 上
// 对随机局面都能给出合法且能真正还原的解法。
//
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'number-puzzle-solver.html'), 'utf8');
const open = '<script id="solver-src" type="text/js-worker">';
const i0 = html.indexOf(open);
const src = html.slice(i0 + open.length, html.indexOf('</script>', i0));
const api = new Function(src + '\nreturn { solvePuzzle: solvePuzzle, solveConstructive: solveConstructive };')();
const solveConstructive = api.solveConstructive;

function goalBoard(n) {
  const T = n * n, b = new Array(T);
  for (let i = 0; i < T - 1; i++) b[i] = i + 1;
  b[T - 1] = 0;
  return b;
}
function neighbors(b, n) {
  const blank = b.indexOf(0);
  const r = (blank / n) | 0, c = blank % n;
  const out = [];
  const push = (p) => { const nb = b.slice(); nb[blank] = nb[p]; nb[p] = 0; out.push(nb); };
  if (r > 0) push(blank - n);
  if (r < n - 1) push(blank + n);
  if (c > 0) push(blank - 1);
  if (c < n - 1) push(blank + 1);
  return out;
}
function randomWalk(n, steps) {
  let b = goalBoard(n), last = -1;
  for (let i = 0; i < steps; i++) {
    const blank = b.indexOf(0);
    const cand = neighbors(b, n).filter((x) => x.indexOf(0) !== last);
    last = blank;
    b = cand[(Math.random() * cand.length) | 0];
  }
  return b;
}
function isSolvable(board, n) {
  const t = board.filter((v) => v !== 0);
  let inv = 0;
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[i] > t[j]) inv++;
  if (n % 2 === 1) return inv % 2 === 0;
  const rowFromBottom = n - Math.floor(board.indexOf(0) / n);
  return (inv + rowFromBottom) % 2 === 1;
}
function randomPermutation(n) {
  const T = n * n;
  const p = goalBoard(n);
  for (let i = T - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}
function verify(board, moves, n) {
  const b = board.slice();
  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];
    if (b[mv.from] !== mv.tile) return `第 ${i + 1} 步非法：格 ${mv.from} 是 ${b[mv.from]}，不是 ${mv.tile}`;
    if (b[mv.to] !== 0) return `第 ${i + 1} 步非法：目标格 ${mv.to} 不是空格`;
    b[mv.to] = mv.tile;
    b[mv.from] = 0;
  }
  const g = goalBoard(n);
  for (let i = 0; i < b.length; i++) if (b[i] !== g[i]) return `结束后未还原：位置 ${i} 是 ${b[i]}`;
  return null;
}

let fails = 0;
const ROUNDS = Number(process.argv[2] || 40);

for (let n = 3; n <= 8; n++) {
  let totalMoves = 0;
  let maxMoves = 0;
  let worstMs = 0;
  let bad = 0;
  for (let t = 0; t < ROUNDS; t++) {
    // 一半用随机游走（模拟“打乱”），一半用随机排列（真正的随机局面）
    let b;
    if (t % 2 === 0) {
      b = randomWalk(n, 60 * n);
    } else {
      do { b = randomPermutation(n); } while (!isSolvable(b, n));
    }
    const res = solveConstructive(b, n);
    if (!res.ok) {
      bad++;
      console.log(`  ✗ n=${n} 构造失败：${res.reason}`);
      if (bad === 1 && process.env.DEBUG) {
        const d = res.debug;
        console.log('    board :', d.board.join(','));
        console.log('    frozen:', d.frozen.join(''));
        console.log('    blank :', d.blank);
      }
      continue;
    }
    const err = verify(b, res.moves, n);
    if (err) { bad++; console.log(`  ✗ n=${n} ${err}`); continue; }
    totalMoves += res.moves.length;
    if (res.moves.length > maxMoves) maxMoves = res.moves.length;
    if (res.elapsed > worstMs) worstMs = res.elapsed;
  }
  const avg = bad === ROUNDS ? 0 : Math.round(totalMoves / Math.max(1, ROUNDS - bad));
  console.log(`n=${n}x${n}  成功 ${ROUNDS - bad}/${ROUNDS}  平均 ${avg} 步  最长 ${maxMoves} 步  最慢 ${worstMs}ms`);
  if (bad) fails += bad;
}

console.log(fails === 0 ? '\n✅ 构造法全部通过' : `\n❌ 失败 ${fails} 次`);
process.exit(fails === 0 ? 0 : 1);
