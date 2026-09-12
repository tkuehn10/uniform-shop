// Not-yet-built screens from docs/screens-and-flows.md (Phase 3 of
// implementation-roadmap.md). Kept as real routes with a clear pointer back
// to the spec, rather than 404s, so the nav and role-gating can be wired up
// and tested before every screen's real functionality is built out.

export function PlaceholderPage({ title, screenRef }: { title: string; screenRef: string }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="muted">
        Not built yet — see <code>docs/screens-and-flows.md</code> {screenRef} for the spec, and
        Phase 3 of <code>docs/implementation-roadmap.md</code> for build order.
      </p>
    </div>
  )
}
