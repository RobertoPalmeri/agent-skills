#!/usr/bin/env node
// Shared mistake memory for agents. Zero dependencies, plain JSONL file.
//   node lessons.js add <area> "what was rejected and why"
//   node lessons.js prompt [n]    -> text block to paste at the end of a prompt
//   node lessons.js list [n]      -> last n lessons as JSON lines
//   node lessons.js --selftest
// File: ./.agent-lessons/lessons.jsonl (override with LESSONS_FILE).
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_FILE = process.env.LESSONS_FILE || path.join(process.cwd(), '.agent-lessons', 'lessons.jsonl');

function add(area, problem, file = DEFAULT_FILE) {
  const text = String(problem || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ date: new Date().toISOString(), area: area || 'general', problem: text }) + '\n');
    return true;
  } catch (e) {
    return false; // the memory must never block the real work
  }
}

function list(n = 200, file = DEFAULT_FILE) {
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row.problem === 'string') rows.push(row); // skip anything that is not a lesson
    } catch (e) { /* skip a corrupt line, keep the rest */ }
  }
  return rows.slice(-n);
}

// Newest first, no near-duplicates, and areas starting with "infra" are left out:
// tool or network failures help a weekly review, not a writing prompt.
function promptBlock(n = 6, file = DEFAULT_FILE) {
  const seen = new Set();
  const picked = list(200, file).reverse()
    .filter((l) => !/^infra/i.test(String(l.area)))
    .filter((l) => {
      const key = l.problem.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, n);
  if (!picked.length) return '';
  return '\n\nRECENT MISTAKES REVIEWERS REJECTED (do not repeat them):\n- ' + picked.map((l) => l.problem.slice(0, 140)).join('\n- ');
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-'));
  const file = path.join(dir, 'l.jsonl');
  add('copy', 'Opening line promised a result the video never showed in the end', file);
  add('copy', 'opening line promised a result the video never showed in the end, again', file); // near-duplicate
  add('Infra', 'Upload timed out at 3am', file);                                    // excluded from prompts
  fs.appendFileSync(file, 'not json\nnull\n{"area":"copy"}\n');                     // corrupt lines are tolerated
  add('facts', 'Claimed a number with no source', file);
  const block = promptBlock(6, file);
  const bullets = block.split('\n- ').length - 1;
  const ok = list(10, file).length === 4 && bullets === 2 && !/3am/.test(block);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(ok ? 'selftest ok' : 'selftest FAILED');
  process.exitCode = ok ? 0 : 1;
}

module.exports = { add, list, promptBlock };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === '--selftest') selftest();
  else if (cmd === 'add') console.log(add(a, b) ? 'saved' : 'nothing saved');
  else if (cmd === 'list') list(Number(a) || 20).forEach((l) => console.log(JSON.stringify(l)));
  else if (cmd === 'prompt') console.log(promptBlock(Number(a) || 6) || '(no lessons yet)');
  else console.log('usage: node lessons.js add <area> "<problem>" | prompt [n] | list [n] | --selftest');
}
