// The f menu's families of functions, each one wrapped around both sides by engine/wrap.ts.
import type { Wrap } from '../engine/wrap';

export interface WrapItem { key: string; f: Wrap; label: string; show: string; ask?: string; tpl?: string }
/** The f menu: tabs of functions you can apply to both sides. `ask` items need a number typed in. */
export const FN_TABS: { name: string; items: WrapItem[] }[] = [
  { name: 'Powers', items: [
    { key: 'q', f: 'square', label: 'square', show: '( )²' },
    { key: 'u', f: 'cube', label: 'cube', show: '( )³' },
    { key: 'n', f: 'power', label: 'power n', show: '( )ⁿ', ask: 'n' },
    { key: 'v', f: 'recip', label: 'flip', show: '1/( )' },
  ] },
  { name: 'Roots', items: [
    { key: 'r', f: 'sqrt', label: 'square root', show: '√( )' },
    { key: 'c', f: 'cbrt', label: 'cube root', show: '∛( )' },
    { key: 'k', f: 'root', label: 'nth root', show: 'ⁿ√( )', ask: 'n' },
  ] },
  { name: 'Exp and log', items: [
    { key: 'e', f: 'exp', label: 'e to the', show: 'e^( )' },
    { key: 'x', f: 'pow10', label: '10 to the', show: '10^( )' },
    { key: 'p', f: 'powb', label: 'b to the', show: 'b^( )', ask: 'b' },
    { key: 'l', f: 'ln', label: 'natural log', show: 'ln( )' },
    { key: 'g', f: 'log', label: 'log base 10', show: 'log( )' },
    { key: 'h', f: 'logb', label: 'log base b', show: 'log_b( )', ask: 'b' },
  ] },
  { name: 'Trig', items: [
    { key: 's', f: 'sin', label: 'sine', show: 'sin( )' },
    { key: 'o', f: 'cos', label: 'cosine', show: 'cos( )' },
    { key: 't', f: 'tan', label: 'tangent', show: 'tan( )' },
    { key: 'a', f: 'asin', label: 'inverse sine', show: 'sin⁻¹( )' },
    { key: 'w', f: 'acos', label: 'inverse cosine', show: 'cos⁻¹( )' },
    { key: 'y', f: 'atan', label: 'inverse tangent', show: 'tan⁻¹( )' },
  ] },
];
export const WRAPS: WrapItem[] = FN_TABS.flatMap(t => t.items);
