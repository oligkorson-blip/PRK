import { buildStatTiles } from "@/lib/assets/stat-tiles";
import type { MetricProvenance } from "@/lib/assets/metric-provenance";

function nonempty(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export function OpportunityDetailLocation({
  city,
  country,
  siteType,
  visitorsPerDay,
  visitorsProvenance,
  availableSpaces,
  spaces,
  annualRevenueEur,
  revenueProvenance,
  placeStory,
  demandStory,
  numbersNote
}: {
  city: string;
  country: string;
  siteType?: string | null;
  visitorsPerDay: number | null;
  visitorsProvenance: MetricProvenance;
  availableSpaces: number | null;
  spaces: number;
  annualRevenueEur: number | null;
  revenueProvenance: MetricProvenance;
  placeStory?: string | null;
  demandStory?: string | null;
  numbersNote?: string | null;
}) {
  const stats = buildStatTiles({
    spaces,
    availableSpaces,
    visitorsPerDay,
    visitorsProvenance,
    annualRevenueEur,
    revenueProvenance
  });
  const place = nonempty(placeStory);
  const demand = nonempty(demandStory);
  const numbers = nonempty(numbersNote);
  const cityLabel = city.trim();
  const countryLabel = country.trim();

  return (
    <section id="location" className="detail-block">
      <p className="detail-section-kicker">The place</p>
      <h2 className="h3">
        {cityLabel}, {countryLabel}
        {siteType ? ` · ${siteType}` : ""}
      </h2>
      {place ? (
        <p className="lead detail-place-story">{place}</p>
      ) : (
        <p>
          Located in {cityLabel}, {countryLabel}
          {siteType ? ` (${siteType})` : ""}.
        </p>
      )}
      {demand ? (
        <div className="detail-demand">
          <h3 className="h4">What drives demand</h3>
          <p>{demand}</p>
        </div>
      ) : null}
      {stats.length > 0 ? (
        <div className="stat-tile-block stack-6">
          <div className="stat-tile-row" aria-label="Key asset figures">
            {stats.map((s) => (
              <div className="stat-tile" key={s.label}>
                <b className="stat-tile-value">{s.value}</b>
                <span className="stat-tile-label">{s.label}</span>
                {s.hint ? <span className="field-hint stat-tile-hint">{s.hint}</span> : null}
              </div>
            ))}
          </div>
          <p className="field-hint modelled-banner">
            Operating figures are labelled by source. Modelled figures are not audited accounts.
            {numbers ? ` ${numbers}` : ""} Local demand indicators do not guarantee investment
            performance.
          </p>
        </div>
      ) : numbers ? (
        <p className="field-hint stack-5">
          {numbers} Local demand indicators do not guarantee investment performance.
        </p>
      ) : (
        <p className="field-hint stack-5">
          Local demand indicators do not guarantee investment performance.
        </p>
      )}
    </section>
  );
}
