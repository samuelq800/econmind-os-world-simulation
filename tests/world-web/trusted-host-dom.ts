/** OFFLINE TEST_ONLY DOM contract double. Executes shipped views/controllers/
 * clients with bounded intercepted transport; NOT a native-browser/live claim. */
export class HostElement {
  children: HostElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  parent: HostElement | null = null;
  open = false;
  disabled = false;
  checked = false;
  private own = '';
  constructor(
    readonly tag: string,
    readonly document: HostDocument,
  ) {}
  set textContent(value: string) {
    this.own = value;
    this.children = [];
  }
  get textContent(): string {
    return [this.own, ...this.children.map((c) => c.textContent)].join('\n');
  }
  append(...children: HostElement[]) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children: HostElement[]) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.own = '';
    this.append(...children);
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  getAttribute(key: string) {
    return this.attributes.get(key);
  }
  addEventListener(key: string, fn: () => void) {
    this.listeners.set(key, fn);
  }
  click() {
    if (!this.disabled) this.listeners.get('click')?.();
  }
  contains(element: unknown): boolean {
    return this === element || this.children.some((c) => c.contains(element));
  }
  focus() {
    this.document.activeElement = this;
  }
  close() {
    this.open = false;
    this.listeners.get('close')?.();
  }
  showModal() {
    this.open = true;
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter((c) => c !== this);
  }
  all(): HostElement[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
  querySelector(selector: string): HostElement | null {
    if (selector === '.national-tools') return this.document.tools;
    const match = /^\[data-([a-z-]+)(?:="([^"]+)")?\]$/u.exec(selector);
    if (!match) return null;
    const key = match[1]!.replace(/-([a-z])/gu, (_, c: string) =>
      c.toUpperCase(),
    );
    return (
      this.all().find(
        (el) =>
          Object.hasOwn(el.dataset, key) &&
          (match[2] === undefined || el.dataset[key] === match[2]),
      ) ?? null
    );
  }
  querySelectorAll() {
    return [];
  }
}
export class HostDocument {
  activeElement: HostElement | null = null;
  readonly body = new HostElement('body', this);
  readonly root = new HostElement('main', this);
  readonly tools = new HostElement('nav', this);
  constructor(role: string) {
    Object.assign(this.root.dataset, { country: '01', office: role });
    this.root.append(this.tools);
    this.body.append(this.root);
  }
  createElement(tag: string) {
    return new HostElement(tag, this);
  }
  createTextNode(text: string) {
    const node = new HostElement('#text', this);
    node.textContent = text;
    return node;
  }
  querySelector(selector: string) {
    return selector === '.country-game'
      ? this.root
      : this.root.querySelector(selector);
  }
}
