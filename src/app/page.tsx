"use client";

import { useEffect, useState } from "react";

interface RepoSummary {
  owner: string;
  name: string;
  prCount: number;
}
interface Pull {
  number: number;
  title: string;
  summary: string | null;
  changeType: string | null;
  audience: string | null;
  url: string | null;
}
interface Hit extends Pull {
  similarity: number;
}

const CHANGE_COLORS: Record<string, string> = {
  feat: "#3fb950",
  fix: "#d29922",
  perf: "#a371f7",
  docs: "#58a6ff",
  chore: "#6e7681",
  breaking: "#f85149",
};

const c = {
  accent: "#58a6ff",
  text: "#e6edf3",
  muted: "#8b949e",
  surface: "#161b22",
  border: "#30363d",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
};

function Badge({ kind }: { kind: string | null }) {
  const color = CHANGE_COLORS[kind ?? "chore"] ?? c.muted;
  return (
    <span
      style={{
        fontFamily: c.mono,
        fontSize: ".7rem",
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color,
        border: `1px solid ${color}55`,
        background: `${color}14`,
        borderRadius: 6,
        padding: ".1rem .45rem",
      }}
    >
      {kind ?? "chore"}
    </span>
  );
}

function PRCard({ pr, similarity }: { pr: Pull; similarity?: number }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: "0.9rem 1rem", background: c.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
        <Badge kind={pr.changeType} />
        {pr.audience && (
          <span style={{ fontFamily: c.mono, fontSize: ".7rem", color: c.muted }}>{pr.audience}</span>
        )}
        <a
          href={pr.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          style={{ fontFamily: c.mono, fontSize: ".8rem", color: c.accent, textDecoration: "none", marginLeft: "auto" }}
        >
          #{pr.number}
        </a>
      </div>
      <div style={{ fontWeight: 600, marginTop: ".4rem" }}>{pr.title}</div>
      {pr.summary && <div style={{ color: c.muted, marginTop: ".25rem", fontSize: ".92rem" }}>{pr.summary}</div>}
      {similarity !== undefined && (
        <div style={{ marginTop: ".5rem", display: "flex", alignItems: "center", gap: ".5rem" }}>
          <div style={{ flex: 1, height: 4, background: c.border, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(similarity * 100)}%`, height: "100%", background: c.accent }} />
          </div>
          <span style={{ fontFamily: c.mono, fontSize: ".7rem", color: c.muted }}>
            {(similarity * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

/** Minimal renderer for our release-notes Markdown (## headings + "- " bullets). */
function Notes({ md }: { md: string }) {
  return (
    <div style={{ lineHeight: 1.7 }}>
      {md.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (t.startsWith("## ")) {
          return (
            <h3
              key={i}
              style={{
                color: c.accent,
                fontFamily: c.mono,
                fontSize: ".8rem",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                margin: "1.1rem 0 .35rem",
              }}
            >
              {t.slice(3)}
            </h3>
          );
        }
        if (t.startsWith("- ")) {
          return (
            <div key={i} style={{ color: c.text, display: "flex", gap: ".5rem" }}>
              <span style={{ color: c.muted }}>•</span>
              <span>{t.slice(2)}</span>
            </div>
          );
        }
        return (
          <p key={i} style={{ color: c.muted, margin: ".2rem 0" }}>
            {t}
          </p>
        );
      })}
    </div>
  );
}

export default function Home() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => {
        setRepos(d.repos ?? []);
        if (d.repos?.[0]) setActive(`${d.repos[0].owner}/${d.repos[0].name}`);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!active) return;
    setHits(null);
    setSearchMsg(null);
    fetch(`/api/pulls?repo=${active}`).then((r) => r.json()).then((d) => setPulls(d.pullRequests ?? []));
    fetch(`/api/release-notes?repo=${active}`).then((r) => r.json()).then((d) => setNotes(d.markdown ?? null));
  }, [active]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !query.trim()) return;
    setSearchMsg("Searching…");
    const res = await fetch(`/api/search?repo=${active}&q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      setHits(null);
      setSearchMsg("Search needs a working LLM key to embed the query.");
      return;
    }
    const d = await res.json();
    setHits(d.hits ?? []);
    setSearchMsg(d.hits?.length ? null : "No matches.");
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "3rem 1.5rem", color: c.text }}>
      <p style={{ fontFamily: c.mono, color: c.accent, letterSpacing: ".1em", fontSize: ".75rem", margin: 0 }}>
        RELEASEIQ
      </p>
      <h1 style={{ fontSize: "2.4rem", margin: ".2rem 0 .4rem" }}>Know what shipped — and why.</h1>
      <p style={{ color: c.muted, margin: 0 }}>
        AI release-intelligence over your merged PRs · Aurora PostgreSQL + pgvector on Vercel.
      </p>

      {error && <p style={{ color: CHANGE_COLORS.breaking, marginTop: "1rem" }}>{error}</p>}

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", margin: "1.6rem 0" }}>
        {repos.length === 0 && (
          <span style={{ color: c.muted }}>No repos ingested yet — run `npm run db:seed`.</span>
        )}
        {repos.map((r) => {
          const id = `${r.owner}/${r.name}`;
          const on = id === active;
          return (
            <button
              key={id}
              onClick={() => setActive(id)}
              style={{
                fontFamily: c.mono,
                fontSize: ".82rem",
                color: on ? "#0d1117" : c.text,
                background: on ? c.accent : "transparent",
                border: `1px solid ${on ? c.accent : c.border}`,
                borderRadius: 8,
                padding: ".35rem .7rem",
                cursor: "pointer",
              }}
            >
              {id} · {r.prCount}
            </button>
          );
        })}
      </div>

      {active && (
        <form onSubmit={runSearch} style={{ display: "flex", gap: ".5rem", marginBottom: "1.5rem" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask what changed and why…"
            style={{
              flex: 1,
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              padding: ".55rem .8rem",
              color: c.text,
            }}
          />
          <button
            type="submit"
            style={{ background: c.accent, color: "#0d1117", border: "none", borderRadius: 8, padding: "0 1.1rem", fontWeight: 600, cursor: "pointer" }}
          >
            Search
          </button>
        </form>
      )}

      {searchMsg && <p style={{ color: c.muted }}>{searchMsg}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: ".7rem" }}>
        {(hits ?? pulls).map((pr) => (
          <PRCard key={pr.number} pr={pr} similarity={(pr as Hit).similarity} />
        ))}
      </div>

      {notes && !hits && (
        <section style={{ marginTop: "2.5rem" }}>
          <h2 style={{ fontSize: "1.2rem", borderBottom: `1px solid ${c.border}`, paddingBottom: ".4rem" }}>
            Release notes
          </h2>
          <Notes md={notes} />
        </section>
      )}
    </main>
  );
}
