"use client";
import { useEffect } from 'react';
export function moveFocus(key: string, root: ParentNode = document): boolean {
  const active = document.activeElement as HTMLElement | null;
  const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-tv-focus]')).filter(el => !el.hasAttribute('disabled') && el.tabIndex >= 0 && el.getBoundingClientRect().width > 0 && el.getAttribute('aria-hidden') !== 'true');
  if (!elements.length) return false;
  if (!active || !elements.includes(active)) { elements[0].focus(); return true; }
  const box = active.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const direction = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  let best: HTMLElement | undefined, score = Infinity;
  for (const el of elements) {
    if (el === active) continue;
    const b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - x, dy = b.top + b.height / 2 - y;
    const primary = (horizontal ? dx : dy) * direction, cross = Math.abs(horizontal ? dy : dx);
    if (primary <= 8) continue;
    const candidate = primary + cross * 3;
    if (candidate < score) { best = el; score = candidate; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return true; }
  return false;
}
export function FocusNavigation() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.key.startsWith('Arrow')) return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); moveFocus(event.key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
