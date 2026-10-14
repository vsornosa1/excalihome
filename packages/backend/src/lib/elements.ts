/**
 * Element revision identity used for optimistic concurrency.
 *
 * Excalidraw elements carry their own `version` and `versionNonce`; the pair is
 * what identifies the exact revision a client last saw. `versionNonce` is
 * optional in practice (the seed data omits it), so absent fields resolve to 0
 * rather than NaN/undefined — otherwise every comparison would be false and
 * conflict detection would silently pass stale writes through.
 */

export type ElementRevision = { version: number; versionNonce: number };

export function revisionOf(element: {
  version?: number;
  versionNonce?: number;
}): ElementRevision {
  return {
    version: element.version ?? 0,
    versionNonce: element.versionNonce ?? 0,
  };
}

export function sameRevision(a: ElementRevision, b: ElementRevision): boolean {
  return a.version === b.version && a.versionNonce === b.versionNonce;
}

export function indexElements<T extends { id: string }>(elements: T[]): Map<string, T> {
  return new Map(elements.map((element) => [element.id, element]));
}
