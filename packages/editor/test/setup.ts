// jsdom has no layout. ProseMirror asks for rectangles when it scrolls the cursor into view.
const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
const rects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
for (const proto of [Element.prototype, Range.prototype]) {
  proto.getClientRects = rects;
  proto.getBoundingClientRect = () => rect as DOMRect;
}
