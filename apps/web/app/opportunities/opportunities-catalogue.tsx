"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AssetCard, type AssetCardData } from "@/components/asset-card";
import { QuickViewModal } from "@/components/quick-view-modal";
import { hasEv, isMultiIncome } from "@/lib/assets/income-streams";
import {
  buildOpportunityPresentation,
  normalizeSiteType,
  siteTypeDisplay
} from "@/lib/assets/presentation";
import { listFieldsToPresentationInput } from "@/lib/assets/list-fields";
import { cataloguePageSlice, catalogueTotalPages } from "@/lib/assets/catalogue-pagination";
import {
  catalogueMinBasis,
  catalogueYieldBasis,
  countFullyFunded,
  matchesMinBand,
  matchesYieldBand,
  parseCatalogueSort,
  sortCatalogueAssets
} from "@/lib/assets/catalogue-view";

export type CatalogueAsset = AssetCardData;

export function OpportunitiesCatalogue({ assets }: { assets: CatalogueAsset[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusResultsAfterPageChange = useRef(false);

  const city = searchParams.get("city") ?? "all";
  const minBand = searchParams.get("min") ?? "all";
  const yieldBand = searchParams.get("yield") ?? "all";
  const assetType = searchParams.get("type") ?? "all";
  const hasEvFilter = searchParams.get("features") ?? "all";
  const fundingFilter = searchParams.get("funding") ?? "open";
  const sort = parseCatalogueSort(searchParams.get("sort"));
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickView, setQuickView] = useState<CatalogueAsset | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterToggleRef = useRef<HTMLButtonElement>(null);

  const setParams = useCallback(
    (patch: Record<string, string>, opts?: { resetPage?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === "all") {
          if (key === "funding" && value === "all") next.set(key, "all");
          else next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      if (opts?.resetPage !== false) {
        next.delete("page");
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const cities = useMemo(
    () => Array.from(new Set(assets.map((a) => a.city))).sort((a, b) => a.localeCompare(b)),
    [assets]
  );
  const siteTypes = useMemo(
    () =>
      Array.from(
        new Set(
          assets
            .map((a) => normalizeSiteType(a.siteType))
            .filter(Boolean) as string[]
        )
      ).sort((a, b) => a.localeCompare(b)),
    [assets]
  );

  const filtered = useMemo(() => {
    const list = assets.filter((a) => {
      if (city !== "all" && a.city !== city) return false;
      if (assetType !== "all" && normalizeSiteType(a.siteType) !== assetType) return false;
      if (hasEvFilter === "yes" && !hasEv(a.incomeMix)) return false;
      if (hasEvFilter === "multi" && !isMultiIncome(a.incomeMix)) return false;

      const presentation = buildOpportunityPresentation(listFieldsToPresentationInput(a));
      if (fundingFilter === "open" && presentation.status.id !== "open") return false;
      if (fundingFilter === "full" && presentation.status.id !== "fully_funded") return false;

      if (!matchesMinBand(catalogueMinBasis(a), minBand)) return false;
      if (!matchesYieldBand(catalogueYieldBasis(a), yieldBand)) return false;

      return true;
    });

    return sortCatalogueAssets(list, sort);
  }, [assets, city, minBand, yieldBand, assetType, hasEvFilter, fundingFilter, sort]);

  const totalPages = catalogueTotalPages(filtered.length);
  const safePage = Math.min(page, totalPages);
  const pageSlice = cataloguePageSlice(filtered, safePage);

  const fullyFundedCount = useMemo(() => countFullyFunded(assets), [assets]);

  useEffect(() => {
    if (page !== safePage) {
      setParams({ page: String(safePage) }, { resetPage: false });
    }
  }, [page, safePage, setParams]);

  useEffect(() => {
    if (!focusResultsAfterPageChange.current) return;
    focusResultsAfterPageChange.current = false;
    resultsRef.current?.focus();
    resultsRef.current?.scrollIntoView({ block: "start" });
  }, [safePage]);

  const changePage = useCallback(
    (nextPage: number) => {
      focusResultsAfterPageChange.current = true;
      setParams({ page: String(nextPage) }, { resetPage: false });
    },
    [setParams]
  );

  const chips: { key: string; label: string; clear: Record<string, string> }[] = [];
  if (city !== "all") chips.push({ key: "city", label: city, clear: { city: "all" } });
  if (minBand !== "all") {
    chips.push({
      key: "min",
      label:
        minBand === "under10" ? "Under €10k" : minBand === "10to25" ? "€10–25k" : "Over €25k",
      clear: { min: "all" }
    });
  }
  if (yieldBand !== "all") {
    chips.push({
      key: "yield",
      label: yieldBand === "under8" ? "Under 8%" : yieldBand === "8to9" ? "8–9%" : "Over 9%",
      clear: { yield: "all" }
    });
  }
  if (assetType !== "all")
    chips.push({ key: "type", label: siteTypeDisplay(assetType) ?? assetType, clear: { type: "all" } });
  if (hasEvFilter !== "all") {
    chips.push({
      key: "features",
      label: hasEvFilter === "yes" ? "EV ready" : "Multi-income",
      clear: { features: "all" }
    });
  }
  // Only show a funding chip when the user explicitly chose one — "open" is the default view.
  if (fundingFilter !== "all" && searchParams.has("funding")) {
    chips.push({
      key: "funding",
      label: fundingFilter === "open" ? "Open" : "Fully funded",
      clear: { funding: "all" }
    });
  }

  const activeFilters = chips.length;

  function clearFilters() {
    setParams({
      city: "all",
      min: "all",
      yield: "all",
      type: "all",
      features: "all",
      funding: "all"
    });
  }

  useEffect(() => {
    if (!filtersOpen) return;
    const panel = filterPanelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFiltersOpen(false);
        filterToggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const first = panel?.querySelector<HTMLElement>("select, button");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [filtersOpen]);

  return (
    <>
      <div className="filter-toolbar">
        <button
          ref={filterToggleRef}
          type="button"
          className="btn btn-ghost btn-sm filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="catalogue-filters"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          {filtersOpen ? "Hide filters" : "Filters"}
          {activeFilters > 0 ? ` (${activeFilters})` : ""}
        </button>
        <div className="filter-field filter-sort">
          <label htmlFor="filter-sort">Sort</label>
          <select
            id="filter-sort"
            value={sort}
            onChange={(e) => setParams({ sort: e.target.value })}
          >
            <option value="min_asc">Lowest minimum</option>
            <option value="yield_desc">Highest target return</option>
            <option value="name_asc">Name A–Z</option>
          </select>
        </div>
        <span className="filter-count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"}
          {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : ""}
        </span>
        {fullyFundedCount > 0 ? (
          <span className="field-hint filter-funded-note">
            {fullyFundedCount === 1
              ? "1 opportunity fully funded"
              : `${fullyFundedCount} opportunities fully funded`}
          </span>
        ) : null}
        {activeFilters > 0 ? (
          <button type="button" className="link-arrow filter-clear" onClick={clearFilters}>
            Clear all
          </button>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <ul className="filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                className="filter-chip"
                onClick={() => setParams(chip.clear)}
              >
                {chip.label}
                <span aria-hidden="true"> ×</span>
                <span className="sr-only">Remove {chip.label} filter</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        id="catalogue-filters"
        ref={filterPanelRef}
        className={`filter-bar${filtersOpen ? " is-open" : ""}`}
      >
        <div className="filter-field">
          <label htmlFor="filter-city">Location</label>
          <select
            id="filter-city"
            value={city}
            onChange={(e) => setParams({ city: e.target.value })}
          >
            <option value="all">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="filter-min">From</label>
          <select
            id="filter-min"
            value={minBand}
            onChange={(e) => setParams({ min: e.target.value })}
          >
            <option value="all">Any</option>
            <option value="under10">Under €10,000</option>
            <option value="10to25">€10,000–€25,000</option>
            <option value="over25">Over €25,000</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="filter-yield">Target return</label>
          <select
            id="filter-yield"
            value={yieldBand}
            onChange={(e) => setParams({ yield: e.target.value })}
          >
            <option value="all">Any</option>
            <option value="under8">Under 8%</option>
            <option value="8to9">8%–9%</option>
            <option value="over9">Over 9%</option>
          </select>
          <p className="field-hint">
            Bands match each listing&apos;s highest option target. Targets are not guaranteed.
          </p>
        </div>
        <details className="catalogue-more-filters">
          <summary>More filters</summary>
          <div className="catalogue-more-filters-grid">
            <div className="filter-field">
              <label htmlFor="filter-type">Place type</label>
              <select
                id="filter-type"
                value={assetType}
                onChange={(e) => setParams({ type: e.target.value })}
              >
                <option value="all">All types</option>
                {siteTypes.map((t) => (
                  <option key={t} value={t}>
                    {siteTypeDisplay(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-field">
              <label htmlFor="filter-features">Features</label>
              <select
                id="filter-features"
                value={hasEvFilter}
                onChange={(e) => setParams({ features: e.target.value })}
              >
                <option value="all">All</option>
                <option value="yes">EV ready</option>
                <option value="multi">Multi-income</option>
              </select>
            </div>
            <div className="filter-field">
              <label htmlFor="filter-status">Funding</label>
              <select
                id="filter-status"
                value={fundingFilter}
                onChange={(e) => setParams({ funding: e.target.value })}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="full">Fully funded</option>
              </select>
            </div>
          </div>
        </details>
      </div>

      <div
        ref={resultsRef}
        tabIndex={-1}
        role="region"
        aria-label="Opportunity results"
      >
        {filtered.length === 0 ? (
          <div className="empty-state">
            {activeFilters > 0 ? (
              <>
                <h2 className="h3">No opportunities match these filters</h2>
                <p className="lead">Clear filters or try another city.</p>
                <button type="button" className="btn btn-ghost" onClick={clearFilters}>
                  Clear all filters
                </button>
              </>
            ) : (
              <>
                <h2 className="h3">No opportunities open right now</h2>
                <p className="lead">New opportunities are on the way — check back soon.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="assets-grid">
              {pageSlice.map((asset) => (
                <AssetCard key={asset.id} asset={asset} onQuickView={setQuickView} />
              ))}
            </div>
            {totalPages > 1 ? (
              <nav className="catalogue-pagination" aria-label="Catalogue pages">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={safePage <= 1}
                  onClick={() => changePage(safePage - 1)}
                >
                  Previous
                </button>
                <span className="field-hint">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={safePage >= totalPages}
                  onClick={() => changePage(safePage + 1)}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        )}
      </div>

      {quickView ? (
        <QuickViewModal asset={quickView} onClose={() => setQuickView(null)} />
      ) : null}
    </>
  );
}