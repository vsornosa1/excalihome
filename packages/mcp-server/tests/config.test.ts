import { resolveApiUrl, DEFAULT_API_URL } from "../src/config";

describe("resolveApiUrl", () => {
  it("falls back to the local backend when the variable is unset", () => {
    expect(resolveApiUrl({} as NodeJS.ProcessEnv)).toBe(DEFAULT_API_URL);
    expect(DEFAULT_API_URL).toBe("http://localhost:3001/api");
  });

  it("falls back when the variable is blank", () => {
    expect(resolveApiUrl({ EXCALIHOME_API_URL: "   " } as NodeJS.ProcessEnv)).toBe(DEFAULT_API_URL);
  });

  it("honours an explicit URL", () => {
    expect(
      resolveApiUrl({ EXCALIHOME_API_URL: "http://diagrams.internal:8080/api" } as NodeJS.ProcessEnv)
    ).toBe("http://diagrams.internal:8080/api");
  });

  it("strips trailing slashes so paths never double up", () => {
    expect(
      resolveApiUrl({ EXCALIHOME_API_URL: "http://localhost:3001/api/" } as NodeJS.ProcessEnv)
    ).toBe("http://localhost:3001/api");
  });

  it("rejects a malformed URL", () => {
    expect(() => resolveApiUrl({ EXCALIHOME_API_URL: "not-a-url" } as NodeJS.ProcessEnv)).toThrow(
      /not a valid URL/
    );
  });

  it("rejects a non-http protocol", () => {
    expect(() =>
      resolveApiUrl({ EXCALIHOME_API_URL: "ftp://example.com/api" } as NodeJS.ProcessEnv)
    ).toThrow(/http/);
  });
});
