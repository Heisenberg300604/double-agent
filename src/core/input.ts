// Keyboard + mouse with Pointer Lock. Presses are edge-triggered and consumed
// once per simulation tick so nothing is lost between frames.

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private dx = 0;
  private dy = 0;
  lmb = false;
  rmb = false;
  private lmbPressed = false;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};
  private readonly target: HTMLElement;

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ControlLeft', 'ControlRight', 'F3', 'KeyQ', 'KeyE', 'KeyF', 'KeyR'].includes(e.code) && this.locked) e.preventDefault();
      if (e.code === 'Tab' || e.code === 'F3') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.lmb = this.rmb = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
      } else if (e.button === 2) {
        this.rmb = true;
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      else if (e.button === 2) this.rmb = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) {
        this.lmb = this.rmb = false;
        this.down.clear();
      }
      this.onLockChange(this.locked);
    });
  }

  requestLock(): void {
    const el = this.target as HTMLElement & { requestPointerLock: (o?: unknown) => Promise<void> | void };
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch(() => {
          try {
            el.requestPointerLock();
          } catch {
            /* ignored */
          }
        });
      }
    } catch {
      el.requestPointerLock();
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once per key press. */
  consume(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  consumeClick(): boolean {
    const p = this.lmbPressed;
    this.lmbPressed = false;
    return p;
  }

  consumeMouse(out: { x: number; y: number }): void {
    out.x = this.dx;
    out.y = this.dy;
    this.dx = this.dy = 0;
  }

  clearPresses(): void {
    this.pressed.clear();
    this.lmbPressed = false;
    this.dx = this.dy = 0;
  }
}
