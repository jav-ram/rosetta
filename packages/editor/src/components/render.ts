/** Turns one component's Markdown into HTML. The app gives it the parser worker; the editor never renders a template itself. */
export type RenderComponent = (markdown: string) => Promise<string>;

/** Remembers results, and shares one pending request between callers, so the same component is not rendered twice. */
export function cachedRenderer(render: RenderComponent, limit = 200): RenderComponent {
  const cache = new Map<string, Promise<string>>();
  return (markdown) => {
    const hit = cache.get(markdown);
    if (hit) return hit;
    const pending = render(markdown);
    cache.set(markdown, pending);
    pending.catch(() => cache.delete(markdown)); // a failure is not remembered
    if (cache.size > limit) cache.delete(cache.keys().next().value!);
    return pending;
  };
}
