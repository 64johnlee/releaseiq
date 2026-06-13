export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 2rem" }}>
      <h1 style={{ color: "#58a6ff", fontSize: "2.4rem", marginBottom: ".5rem" }}>
        ReleaseIQ
      </h1>
      <p style={{ color: "#8b949e", fontSize: "1.1rem", lineHeight: 1.6 }}>
        Agentic release notes + semantic &ldquo;what changed and why&rdquo; search,
        powered by Aurora PostgreSQL + pgvector on Vercel.
      </p>
      <p style={{ color: "#8b949e", marginTop: "2rem", fontSize: ".9rem" }}>
        Backend spine is live. The v0 dashboard lands in the frontend phase.
      </p>
      <ul style={{ color: "#8b949e", fontSize: ".85rem", lineHeight: 1.9 }}>
        <li>
          <code style={{ color: "#3fb950" }}>GET /api/health</code> — DB + pgvector probe
        </li>
        <li>
          <code style={{ color: "#3fb950" }}>POST /api/ingest</code> — ingest + summarize + embed PRs
        </li>
        <li>
          <code style={{ color: "#3fb950" }}>GET /api/search</code> — semantic PR search
        </li>
      </ul>
    </main>
  );
}
