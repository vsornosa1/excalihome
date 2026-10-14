import { createClient } from "../src/client";

const BASE = "http://api.test/api";
let fetchMock: jest.SpyInstance;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  // A Response body can only be read once, so mint a fresh one per call.
  fetchMock = jest
    .spyOn(global, "fetch" as never)
    .mockImplementation((() => Promise.resolve(jsonResponse({}))) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("createClient request shaping", () => {
  it("lists diagrams with a GET against the base URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: "1", name: "One" }]) as never);

    const result = await createClient(BASE).listDiagrams();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/diagrams`);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
    expect(result).toEqual({ ok: true, data: [{ id: "1", name: "One" }] });
  });

  it("posts a patch with the element operations", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "1", version: 3 }) as never);
    const body = { add: [{ id: "x", version: 1, versionNonce: 1 }] };

    const result = await createClient(BASE).patchDiagram("slug-1", body);

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/diagrams/slug-1/patch`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual(body);
    expect(result.ok).toBe(true);
  });

  it("URL-encodes the diagram identifier in the path", async () => {
    await createClient(BASE).getDiagram("weird slug/with slash");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/diagrams/weird%20slug%2Fwith%20slash`);
  });

  it("returns ok with no data for a 204 delete", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }) as never);

    const result = await createClient(BASE).deleteDiagram("1");

    expect(result).toEqual({ ok: true, data: null });
  });

  it("targets the version and restore endpoints", async () => {
    await createClient(BASE).listVersions("d1");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/diagrams/d1/versions`);

    await createClient(BASE).restoreVersion("d1", "v9");
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/diagrams/d1/restore/v9`);
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
  });
});

describe("createClient error mapping", () => {
  it("maps a 409 element conflict and preserves the conflicts", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: "Conflict",
          code: "ELEMENT_CONFLICT",
          currentVersion: 7,
          conflicts: [{ id: "a", reason: "stale_revision", current: { version: 2, versionNonce: 9 } }],
        },
        409
      ) as never
    );

    const result = await createClient(BASE).patchDiagram("d1", {});

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("ELEMENT_CONFLICT");
    expect(result.error).toMatchObject({
      status: 409,
      currentVersion: 7,
      conflicts: [{ id: "a", reason: "stale_revision" }],
    });
  });

  it("distinguishes a stale document conflict", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Conflict", code: "STALE_DOCUMENT", currentVersion: 4 }, 409) as never
    );

    const result = await createClient(BASE).updateDiagram("d1", { name: "x" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("STALE_DOCUMENT");
    expect(result.error).toMatchObject({ currentVersion: 4 });
  });

  it("maps a server error to HTTP_ERROR and does not retry", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500) as never);

    const result = await createClient(BASE).listDiagrams();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toEqual({ code: "HTTP_ERROR", status: 500, message: "boom" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>nope</html>", { status: 502 }) as never);

    const result = await createClient(BASE).listDiagrams();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("HTTP_ERROR");
    expect(result.error).toMatchObject({ status: 502 });
  });
});
