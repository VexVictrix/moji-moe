// A single sampled point of a pointer stroke, in canvas pixel coordinates.
export interface StrokePoint {
  x: number;
  y: number;
}

export type Stroke = StrokePoint[];

// Manages the handwriting canvas as a sequence of pointer strokes.
// Each stroke stores the sampled points, which makes undo/redo-like behavior simple.
export class DrawingPad {
  readonly canvas: HTMLCanvasElement;
  private readonly onChange: () => void;
  private readonly context: CanvasRenderingContext2D;
  private readonly controller: AbortController;
  strokes: Stroke[] = [];
  private pointer: number | null = null;

  constructor(canvas: HTMLCanvasElement, onChange: () => void) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.controller = new AbortController();
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    const options = { signal: this.controller.signal };
    canvas.addEventListener("pointerdown", this.start.bind(this), options);
    canvas.addEventListener("pointermove", this.move.bind(this), options);
    canvas.addEventListener("pointerup", this.end.bind(this), options);
    canvas.addEventListener("pointercancel", this.end.bind(this), options);
    canvas.addEventListener("lostpointercapture", this.end.bind(this), options);
    this.render();
  }

  get empty(): boolean { return this.strokes.length === 0; }
  get isDrawing(): boolean { return this.pointer !== null; }
  get strokeCount(): number { return this.strokes.length; }

  private position(event: PointerEvent): StrokePoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.canvas.width, (event.clientX - rect.left) * this.canvas.width / rect.width)),
      y: Math.max(0, Math.min(this.canvas.height, (event.clientY - rect.top) * this.canvas.height / rect.height)),
    };
  }

  private start(event: PointerEvent): void {
    if (this.pointer !== null || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    // A new stroke begins whenever the user presses the primary pointer on the canvas.
    this.pointer = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.strokes.push([this.position(event)]);
    this.render();
    this.onChange();
  }

  private move(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    const events = event.getCoalescedEvents?.() ?? [];
    const currentStroke = this.strokes.at(-1);
    for (const sample of events.length ? events : [event]) currentStroke?.push(this.position(sample));
    this.render();
    this.onChange();
  }

  private end(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    if (event.type === "pointerup") this.strokes.at(-1)?.push(this.position(event));
    this.pointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.render();
    this.onChange();
  }

  private stop(): void {
    const pointer = this.pointer;
    this.pointer = null;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
  }

  clear(): void { this.stop(); this.strokes = []; this.render(); this.onChange(); }
  undo(): void { this.stop(); this.strokes.pop(); this.render(); this.onChange(); }
  dispose(): void { this.stop(); this.controller.abort(); }

  render(): void {
    const ctx = this.context;
    // Clear the canvas between renders so stale strokes do not remain when the user edits.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#151515";
    ctx.strokeStyle = "#151515";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of this.strokes) {
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
    }
  }
}
