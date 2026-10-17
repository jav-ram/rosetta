import type { AssetRef } from "@rosetta/contracts";
import { describe, expect, test } from "vitest";
import { findAsset, imageResolver, referenceFor } from "../src/images/resolveImage";

const asset = (id: string, name?: string): AssetRef => ({ id, name, mediaType: "image/png", size: 1 });
const assets = [asset("id-1", "tavern.jpg"), asset("id-2", "map.png"), asset("id-3", "map.png"), asset("id-4", "Dragon Lair.png")];

describe("finding the asset an image refers to", () => {
  test("by id, or by file name", () => {
    expect(findAsset(assets, "id-1")?.id).toBe("id-1");
    expect(findAsset(assets, "tavern.jpg")?.id).toBe("id-1");
  });
  test("with assets/ in front, spaces around it, or URL-encoded", () => {
    expect(findAsset(assets, " assets/tavern.jpg ")?.id).toBe("id-1");
    expect(findAsset(assets, "Dragon%20Lair.png")?.id).toBe("id-4");
  });
  test("a name that two assets have is the one added first", () => {
    expect(findAsset(assets, "map.png")?.id).toBe("id-2");
  });
  test("an id wins over a name", () => {
    expect(findAsset([asset("a", "b"), asset("b", "c")], "b")?.id).toBe("b");
  });
  test("nothing matches, or the name is not valid URL encoding", () => {
    expect(findAsset(assets, "nope.png")).toBeUndefined();
    expect(findAsset([asset("x", "100%.png")], "100%.png")?.id).toBe("x");
  });
});

describe("what is loaded for an image", () => {
  const urls = new Map([["id-1", "blob:tavern"]]);
  const resolve = imageResolver(assets, urls);
  test("the project's file, when the name matches and its address is known", () => {
    expect(resolve("tavern.jpg")).toBe("blob:tavern");
  });
  test("otherwise what the preview does by default: addresses as they are, anything else a placeholder", () => {
    expect(resolve("https://example.test/a.png")).toBe("https://example.test/a.png");
    expect(resolve("map.png")).toMatch(/^data:image\/svg/); // an asset, but its address is not known yet
    expect(resolve("nope.png")).toMatch(/^data:image\/svg/);
  });
});

describe("the name written in a chapter", () => {
  test("is the file name, or the id when another asset has the same name or there is none", () => {
    expect(referenceFor(assets[0]!, assets)).toBe("tavern.jpg");
    expect(referenceFor(assets[1]!, assets)).toBe("id-2");
    expect(referenceFor(asset("id-9"), assets)).toBe("id-9");
  });
});
