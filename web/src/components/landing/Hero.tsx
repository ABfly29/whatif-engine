import { ScrollLink } from "../ScrollLink";
import { ButtonLink } from "../ui/Button";
import ComparisonPreview from "./ComparisonPreview";

export default function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="container hero__grid">
        <div className="hero__copy">
          <p className="eyebrow">Financial decisions for India</p>
          <h1 id="hero-h">
            Make your next big financial move <span className="hero__em">with clarity.</span>
          </h1>
          <p className="hero__lede">
            Compare what happens to your money before you change jobs,
            relocate, or take on a major expense.
          </p>
          <div className="hero__cta">
            <ButtonLink to="/app" arrow>Run a comparison</ButtonLink>
            <ScrollLink id="how" className="btn btn--ghost">See how it works</ScrollLink>
          </div>
          <p className="hero__trust">
            Free to explore · No sign-up required · You control the assumptions
          </p>
        </div>
        <div className="hero__visual">
          <ComparisonPreview />
        </div>
      </div>
    </section>
  );
}
