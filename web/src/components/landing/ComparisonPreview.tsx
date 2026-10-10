/**
 * Illustration of how the product reads a decision: two cash paths, an early
 * dip for the switch (gap and moving costs), a break-even crossover, and a gap
 * at the end. Shapes are schematic; there are deliberately no rupee figures.
 */
export default function ComparisonPreview() {
  return (
    <figure className="preview">
      <div className="preview__bar">
        <span className="preview__title">Stay vs Switch</span>
        <span className="preview__tag">Illustration, not your numbers</span>
      </div>

      <svg
        viewBox="0 0 460 250"
        className="preview__chart"
        role="img"
        aria-label="Illustrative chart. The Switch path dips below Stay in the first months, crosses it at break-even, then ends ahead."
      >
        <g stroke="#223049" strokeWidth="1">
          {[40, 95, 150, 205].map((y) => (
            <line key={y} x1="28" y1={y} x2="448" y2={y} />
          ))}
        </g>
        <text x="28" y="232" className="preview__axis">Today</text>
        <text x="448" y="232" textAnchor="end" className="preview__axis">Time →</text>
        <text x="28" y="28" className="preview__axis">Cash</text>

        {/* Stay: steady */}
        <path
          className="preview__path preview__path--stay"
          d="M28 150 C130 144 230 130 330 114 S420 92 448 86"
          fill="none"
          stroke="#9db4d9"
          strokeWidth="2.5"
          strokeDasharray="7 6"
          strokeLinecap="round"
        />
        {/* Switch: dips, then climbs faster */}
        <path
          className="preview__path preview__path--switch"
          d="M28 150 C60 180 96 188 140 170 C200 146 250 104 330 78 S420 44 448 36"
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* break-even marker */}
        <line x1="212" y1="40" x2="212" y2="205" stroke="#31435f" strokeDasharray="3 4" />
        <circle cx="212" cy="122" r="5" fill="#0a111f" stroke="#2dd4bf" strokeWidth="2" />
        <text x="220" y="62" className="preview__label">Break-even</text>

        {/* dip label */}
        <text x="120" y="198" className="preview__note">Gap + moving costs</text>

        {/* series labels */}
        <text x="448" y="26" textAnchor="end" className="preview__label preview__label--switch">Switch</text>
        <text x="448" y="108" textAnchor="end" className="preview__label preview__label--stay">Stay</text>
      </svg>

      <figcaption className="preview__card">
        <span className="preview__card-label">Projected difference</span>
        <span className="preview__card-value">Switch − Stay</span>
        <span className="preview__card-note">
          Your result appears in the calculator, with every assumption shown.
        </span>
      </figcaption>
    </figure>
  );
}
