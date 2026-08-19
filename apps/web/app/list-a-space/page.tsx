import Link from "next/link";
import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { CommunitySpaceHostForm } from "@/components/community-space-host-form";
import { isCommunitySpacesEnabled } from "@/lib/platform-settings/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "List a parking space",
  description:
    "Tell Parkwise about a residential parking space, EV bay, garage, or private lot for manual review."
};

export default async function ListASpacePage() {
  const communitySpacesEnabled = await isCommunitySpacesEnabled();
  return (
    <main>
      <PageIntro
        variant="functional"
        kicker="For parking-space owners"
        title="Turn an unused parking space into a local option."
        lead="Tell us about your residential bay, EV charging space, garage, or private lot. We review every host and listing manually before anything becomes public."
      />
      <section className="section bg-cream">
        <div className="container">
          <div className="register-shell">
            <CommunitySpaceHostForm communitySpacesEnabled={communitySpacesEnabled} />
            <p className="field-hint stack-4">
              Looking for parking instead? <Link href="/apply">Apply to view available spaces</Link>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
