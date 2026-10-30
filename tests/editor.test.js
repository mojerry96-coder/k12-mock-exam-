// Ported from the Gradient Lab practice build: the same structured editor drives working and final answers here.
import { test, expect } from 'vitest';
import { MathModel, parseText } from '../src/lib/editor/model.js';

const type = (m, s) => [...s].forEach((c) => m.insert(c));

test('typing "/" captures the previous operand as numerator and focuses the denominator', () => {
  const m = new MathModel();
  type(m, 'm=4/2');
  expect(m.root.at(-1)).toMatchObject({ k: 'frac' });
  expect(m.toText()).toBe('m=4/2');
});

test('bracketed numerator is captured whole and brackets are dropped', () => {
  const m = new MathModel();
  type(m, 'm=(6-2)/');
  type(m, '3-1');
  expect(m.toText()).toBe('m=(6-2)/(3-1)');
});

test('a whole line typed straight through builds the stacked fraction', () => {
  const m = new MathModel();
  type(m, 'm=6-2/3-1=2');
  expect(m.toText()).toBe('m=(6-2)/(3-1)=2');
  const n = new MathModel();
  type(n, '6-2/3-1');
  expect(n.toText()).toBe('(6-2)/(3-1)');
});

test('a/b first: type the top, then "/" moves down to the bottom', () => {
  const m = new MathModel();
  type(m, 'm=');
  m.insertFraction();
  type(m, '6-2/3-1');
  expect(m.toText()).toBe('m=(6-2)/(3-1)');
});

test('"/" inside an open bracket only takes what is inside it', () => {
  const m = new MathModel();
  type(m, 'm=(6-2/');
  expect(m.root[2]).toMatchObject({ k: 'c', v: '(' });
  expect(m.root[3]).toMatchObject({ k: 'frac', num: [{ v: '6' }, { v: '-' }, { v: '2' }] });
});

test('empty fraction from the a/b button: Tab and arrows move between slots', () => {
  const m = new MathModel();
  type(m, 'm=');
  m.insertFraction();
  type(m, '6-2');
  m.tab();
  type(m, '3-1');
  expect(m.toText()).toBe('m=(6-2)/(3-1)');
  m.vertical(-1); // up to numerator
  expect(m.cursor.path.at(-1)[1]).toBe('num');
  m.vertical(1);
  expect(m.cursor.path.at(-1)[1]).toBe('den');
  m.tab(); // exit the fraction
  expect(m.cursor.path).toEqual([]);
  type(m, '=2');
  expect(m.toText()).toBe('m=(6-2)/(3-1)=2');
});

test('arrow keys walk into and out of slots; nothing is hidden', () => {
  const m = MathModel.fromText('4/2');
  m.setCursor([], 1);
  m.left(); // enter denominator from the right
  expect(m.cursor.path).toEqual([[0, 'den']]);
  m.left(); m.left(); // den start -> num end
  expect(m.cursor.path).toEqual([[0, 'num']]);
  m.left(); m.left();
  expect(m.cursor).toEqual({ path: [], i: 0 });
});

test('backspace deletes characters, enters structures, and removes empty ones', () => {
  const m = new MathModel();
  type(m, '12');
  m.insertFraction();
  m.backspace(); // empty denominator -> numerator end
  expect(m.cursor.path).toEqual([[0, 'num']]);
  m.backspace(); m.backspace();
  m.backspace(); // at start of empty structure -> removed
  expect(m.isEmpty()).toBe(true);
});

test('selection: shift-arrows and select-all replace on typing', () => {
  const m = MathModel.fromText('6-2');
  m.left(true); m.left(true);
  m.insert('5');
  expect(m.toText()).toBe('65');
  m.selectAll();
  m.backspace();
  expect(m.isEmpty()).toBe(true);
});

test('text round-trips through the structured model', () => {
  for (const s of ['m=(6-2)/(3-1)', 'rise=6-(-2)=8', 'm=-15/5', '√(16)=4', 'm=(4-4)/(3-(-2))=0']) {
    expect(MathModel.fromText(s).toText().replace(/×/g, '*')).toBe(s);
  }
  expect(parseText('(6-2)/(3-1)')[0]).toMatchObject({ k: 'frac' });
});

test('a fraction after a number serialises as a product, never a run-on number', () => {
  const m = new MathModel([{ k: 'c', v: '2' }, { k: 'frac', num: [{ k: 'c', v: '1' }], den: [{ k: 'c', v: '2' }] }]);
  expect(m.toText()).toBe('2(1/2)');
});

test('spoken label describes the fraction', () => {
  expect(MathModel.fromText('m=4/2').toSpeech()).toBe('m equals fraction, 4, over 2, end fraction');
});
