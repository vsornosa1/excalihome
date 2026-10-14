import { revisionOf, sameRevision, indexElements } from "../src/lib/elements";

describe("revisionOf", () => {
  it("reads the version and versionNonce from an element", () => {
    expect(revisionOf({ version: 5, versionNonce: 777 })).toEqual({
      version: 5,
      versionNonce: 777,
    });
  });

  it("defaults a missing versionNonce to 0", () => {
    expect(revisionOf({ version: 3 })).toEqual({ version: 3, versionNonce: 0 });
  });

  it("defaults a missing version to 0", () => {
    expect(revisionOf({ versionNonce: 12 })).toEqual({ version: 0, versionNonce: 12 });
  });

  it("defaults both fields to 0 for an element with neither", () => {
    expect(revisionOf({})).toEqual({ version: 0, versionNonce: 0 });
  });

  it("never produces NaN or undefined for absent fields", () => {
    const revision = revisionOf({});
    expect(Number.isNaN(revision.version)).toBe(false);
    expect(Number.isNaN(revision.versionNonce)).toBe(false);
  });
});

describe("sameRevision", () => {
  it("is true for identical revisions", () => {
    expect(sameRevision({ version: 4, versionNonce: 9 }, { version: 4, versionNonce: 9 })).toBe(true);
  });

  it("is false when version differs", () => {
    expect(sameRevision({ version: 4, versionNonce: 9 }, { version: 5, versionNonce: 9 })).toBe(false);
  });

  it("is false when versionNonce differs", () => {
    expect(sameRevision({ version: 4, versionNonce: 9 }, { version: 4, versionNonce: 10 })).toBe(false);
  });
});

describe("indexElements", () => {
  it("maps each element by its id", () => {
    const index = indexElements([
      { id: "el-1", type: "rectangle" },
      { id: "el-2", type: "ellipse" },
    ]);
    expect(index.size).toBe(2);
    expect(index.get("el-2")?.type).toBe("ellipse");
  });

  it("returns an empty map for an empty element list", () => {
    expect(indexElements([]).size).toBe(0);
  });

  it("keeps the last element when ids are duplicated", () => {
    const index = indexElements([
      { id: "dup", version: 1 },
      { id: "dup", version: 2 },
    ]);
    expect(index.size).toBe(1);
    expect(index.get("dup")?.version).toBe(2);
  });
});
