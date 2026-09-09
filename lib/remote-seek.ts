export function remoteKey(event: { key: string; keyCode: number }) {
  return ({ 13: 'Enter', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 10009: 'Escape' } as Record<number, string>)[event.keyCode] || event.key;
}

// Independent of the DOM so remote press/hold/release behavior can be checked.
export class RemoteSeek {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private key = '';
  private held = false;
  private accelerated = false;
  constructor(private actions: { rate: () => number; speedUp: () => void; normal: () => void; seek: (delta: number) => void }) {}
  down(key: string) {
    if (this.key || (key !== 'ArrowLeft' && key !== 'ArrowRight')) return;
    this.key = key;
    this.held = false;
    this.accelerated = this.actions.rate() > 1 && key === 'ArrowRight';
    if (this.accelerated) this.actions.speedUp();
    else if (key === 'ArrowRight') this.timer = setTimeout(() => { this.held = true; this.actions.speedUp(); }, 500);
  }
  up(key: string) {
    if (!this.key || key !== this.key) return false;
    clearTimeout(this.timer);
    if (!this.held && !this.accelerated) {
      if (key === 'ArrowLeft') this.actions.normal();
      this.actions.seek(key === 'ArrowRight' ? 15 : -15);
    }
    this.cancel();
    return true;
  }
  cancel() { clearTimeout(this.timer); this.key = ''; this.held = false; this.accelerated = false; }
}
