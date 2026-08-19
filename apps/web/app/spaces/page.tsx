import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { CommunitySpaceCard } from "@/components/community-space-card";
import { isCommunitySpacesEnabled } from "@/lib/platform-settings/queries";
import { listPublishedCommunitySpaces } from "@/lib/community-spaces/queries";
import {
  communitySpaceCities,
  filterCommunitySpaces,
  normalizeCommunitySpaceCatalogueFilter
} from "@/lib/community-spaces/catalogue";
import {
  COMMUNITY_SPACE_TYPES,
  communitySpaceTypeLabel
} from "@/lib/community-spaces/types";
import { requireSessionUserOrRedirect } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find parking spaces",
  description: "Find verified residential parking, EV bays, garages, and private lots in key local areas."
};

const listSpaceHref = "/list-a-space";

type SearchParams = Promise<{
  city?: string | string[];
  type?: string | string[];
}>;

function one(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function CommunitySpacesPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  await requireSessionUserOrRedirect();
  const params = await searchParams;
  const filter = normalizeCommunitySpaceCatalogueFilter({
    city: one(params.city),
    type: one(params.type)
  });
  const enabled = await isCommunitySpacesEnabled();
  const spaces = enabled ? await listPublishedCommunitySpaces() : [];
  const cities = communitySpaceCities(spaces);
  const filteredSpaces = filterCommunitySpaces(spaces, filter);
  const filtersActive = Boolean(filter.city || filter.spaceType);

  return (
    <>
      <PageIntro
        variant="functional"
        kicker="Community spaces"
        title="Find a parking space near where you need to be."
        lead="Browse verified residential spaces, EV charging bays, garages, and private lots supplied by local hosts."
      />
      <main className="container section">
        {!enabled ? (
          <div className="empty-state">
            <h2>Community spaces are paused</h2>
            <p>We are refreshing the local catalogue. Contact the team if you need help finding a space.</p>
            <div className="empty-state-actions">
              <Link className="btn btn-primary" href={listSpaceHref}>List a space</Link>
              <Link className="btn btn-ghost" href="/contact">Talk to the team</Link>
            </div>
          </div>
        ) : spaces.length > 0 ? (
          <>
            <form className="filter-bar community-space-filters" method="get">
              <div className="filter-field">
                <label htmlFor="community-filter-city">City</label>
                <select
                  id="community-filter-city"
                  name="city"
                  defaultValue={filter.city ?? ""}
                >
                  <option value="">All cities</option>
                  {cities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label htmlFor="community-filter-type">Space type</label>
                <select
                  id="community-filter-type"
                  name="type"
                  defaultValue={filter.spaceType ?? ""}
                >
                  <option value="">All space types</option>
                  {COMMUNITY_SPACE_TYPES.map((type) => (
                    <option key={type} value={type}>{communitySpaceTypeLabel(type)}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" type="submit">Apply filters</button>
              {filtersActive ? (
                <Link className="link-arrow" href="/spaces">Clear filters</Link>
              ) : null}
              <span className="filter-count" aria-live="polite">
                {filteredSpaces.length} {filteredSpaces.length === 1 ? "space" : "spaces"}
              </span>
            </form>

            {filteredSpaces.length > 0 ? (
              <div className="community-space-grid">
                {filteredSpaces.map((space) => (
                  <CommunitySpaceCard key={space.id} space={space} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>No spaces match these filters</h2>
                <p>Try another city or space type, or clear the filters to see every verified listing.</p>
                <Link className="btn btn-ghost" href="/spaces">Clear filters</Link>
              </div>
            )}
            <aside className="empty-state stack-5" aria-labelledby="host-space-heading">
              <h2 id="host-space-heading">Have a parking space to share?</h2>
              <p>
                Send the general location and your contact details. We verify every host before
                publishing a listing, and exact residential addresses stay private.
              </p>
              <Link className="btn btn-primary" href={listSpaceHref}>List a space</Link>
            </aside>
          </>
        ) : (
          <div className="empty-state">
            <h2>No verified spaces published yet</h2>
            <p>
              We are onboarding local hosts manually. If you have a residential bay, EV space, garage,
              or private lot to share, tell us where it is and we will review it.
            </p>
            <div className="empty-state-actions">
              <Link className="btn btn-primary" href={listSpaceHref}>List a space</Link>
              <Link className="btn btn-ghost" href="/contact">Contact Parkwise</Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
