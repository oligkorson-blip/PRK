import { isDemoMode } from "@/lib/demo-mode";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="demo-banner" role="status">
      <strong>Demo environment</strong>
      <span>Sample opportunities and figures for demonstration. Capital at risk.</span>
    </div>
  );
}
