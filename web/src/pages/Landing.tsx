import { AssumptionList } from "../components/Assumptions";
import Hero from "../components/landing/Hero";
import { ButtonLink } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

const STEPS = [
  {
    title: "Enter your situation",
    body: "Take-home pay for both jobs, monthly costs, savings, and any gap, relocation or bonuses. We start you with clearly marked sample numbers.",
  },
  {
    title: "Compare both paths",
    body: "A deterministic engine projects your cash month by month under each choice, then shows the difference and when, if ever, switching catches up.",
  },
  {
    title: "Stress-test the assumptions",
    body: "Change pay growth, inflation or the length of a gap and see how the answer moves. Nothing is hidden behind a score.",
  },
];

const CATEGORIES: { title: string; body: string; available: boolean }[] = [
  {
    title: "Career decisions",
    body: "Stay in your job or take a new offer. Include a gap between jobs, relocation costs, a bonus you give up and a joining bonus.",
    available: true,
  },
  {
    title: "Relocating",
    body: "Compare living costs and income across cities, independent of a job change.",
    available: false,
  },
  {
    title: "Major expenses",
    body: "See how a large purchase or commitment changes your cash over the years that follow.",
    available: false,
  },
];

function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="section-head">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {lead && <p className="muted">{lead}</p>}
    </header>
  );
}

export default function Landing() {
  return (
    <>
      <Hero />

      <section className="section" id="how" aria-labelledby="how-h">
        <div className="container">
          <SectionHead
            id="how-h"
            eyebrow="How it works"
            title="From a gut feeling to a clear comparison"
          />
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="steps__n" aria-hidden="true">{i + 1}</span>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--tint" id="compare" aria-labelledby="compare-h">
        <div className="container">
          <SectionHead
            id="compare-h"
            eyebrow="What you can compare"
            title="Start with a career move"
            lead="More decision types are planned. Only career decisions are available today."
          />
          <div className="cards">
            {CATEGORIES.map((c) => (
              <Card key={c.title} className={`hover-card${c.available ? "" : " is-soon"}`}>
                <span className={`pill${c.available ? " pill--live" : ""}`}>
                  {c.available ? "Available" : "Coming soon"}
                </span>
                <h3>{c.title}</h3>
                <p className="muted">{c.body}</p>
                {c.available && (
                  <ButtonLink to="/app" variant="ghost" small arrow>
                    Open the calculator
                  </ButtonLink>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="about" aria-labelledby="about-h">
        <div className="container split">
          <SectionHead
            id="about-h"
            eyebrow="Transparency and assumptions"
            title="Clear about what this is, and what it is not"
            lead="WhatIf is a projection tool. It shows what follows from the numbers you give it, nothing more. It is not a forecast, a guarantee or financial advice."
          />
          <Card flat>
            <AssumptionList />
          </Card>
        </div>
      </section>

      <section className="section section--tint" aria-labelledby="cta-h">
        <div className="container cta">
          <h2 id="cta-h">Ready to compare your options?</h2>
          <p className="muted">It takes a couple of minutes, and you can change anything.</p>
          <ButtonLink to="/app" arrow>Run a comparison</ButtonLink>
        </div>
      </section>
    </>
  );
}
