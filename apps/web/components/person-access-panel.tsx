import { AdminSection } from "@/components/admin/admin-section";
import type { AccessEventRow } from "@/lib/access/queries";
import { formatDateTimeUtc } from "@/lib/format";

type PersonAccessPanelProps = {
  events: AccessEventRow[];
};

export function flagEmoji(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const offset = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(
    upper.charCodeAt(0) + offset,
    upper.charCodeAt(1) + offset
  );
}

function formatOccurredAt(value: Date): string {
  return formatDateTimeUtc(value);
}

function formatUaSummary(event: AccessEventRow): string {
  const parts = [event.uaBrowser, event.uaOs, event.uaDevice].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  if (event.userAgent) {
    return event.userAgent.length > 120
      ? `${event.userAgent.slice(0, 120)}…`
      : event.userAgent;
  }
  return "—";
}

function formatGeo(event: AccessEventRow): string {
  if (event.enrichmentStatus === "failed") {
    return `Unknown (${event.enrichmentStatus})`;
  }

  const flag = event.countryCode ? `${flagEmoji(event.countryCode)} ` : "";
  const parts = [event.city, event.region, event.countryName ?? event.countryCode].filter(
    Boolean
  );

  if (parts.length === 0) {
    if (event.enrichmentStatus !== "ok") {
      return `Unknown (${event.enrichmentStatus})`;
    }
    return "—";
  }

  return flag + parts.join(", ");
}

function formatProvider(event: AccessEventRow): string {
  const parts = [event.isp, event.org].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function formatNetworkFlags(event: AccessEventRow): string {
  const flags: string[] = [];
  if (event.isVpn) flags.push("VPN");
  if (event.isProxy) flags.push("Proxy");
  if (event.isDatacenter) flags.push("Datacenter");
  return flags.length > 0 ? flags.join(", ") : "—";
}

function enrichmentLabel(event: AccessEventRow): string | null {
  if (event.enrichmentStatus === "ok") return null;
  return event.enrichmentStatus;
}

function LatestAccessTable({ event }: { event: AccessEventRow }) {
  const enrichment = enrichmentLabel(event);

  return (
    <div className="table-wrap">
      <table className="admin-table admin-table-kv">
        <tbody>
        <tr>
          <th scope="row">When</th>
          <td>{formatOccurredAt(event.occurredAt)}</td>
        </tr>
        <tr>
          <th scope="row">Location</th>
          <td>{formatGeo(event)}</td>
        </tr>
        <tr>
          <th scope="row">IP</th>
          <td>{event.ipAddress ?? "—"}</td>
        </tr>
        <tr>
          <th scope="row">Device</th>
          <td>{formatUaSummary(event)}</td>
        </tr>
        <tr>
          <th scope="row">Provider</th>
          <td>{formatProvider(event)}</td>
        </tr>
        <tr>
          <th scope="row">Network</th>
          <td>{formatNetworkFlags(event)}</td>
        </tr>
        {enrichment ? (
          <tr>
            <th scope="row">Enrichment</th>
            <td>{enrichment}</td>
          </tr>
        ) : null}
        </tbody>
      </table>
    </div>
  );
}

function HistoryRow({ event }: { event: AccessEventRow }) {
  const enrichment = enrichmentLabel(event);

  return (
    <tr>
      <td data-label="When">{formatOccurredAt(event.occurredAt)}</td>
      <td data-label="Location">{formatGeo(event)}</td>
      <td data-label="IP">{event.ipAddress ?? "—"}</td>
      <td data-label="Device">{formatUaSummary(event)}</td>
      <td data-label="Provider">{formatProvider(event)}</td>
      <td data-label="Network">{formatNetworkFlags(event)}</td>
      <td data-label="Enrichment">{enrichment ?? "—"}</td>
    </tr>
  );
}

export function PersonAccessPanel({ events }: PersonAccessPanelProps) {
  if (events.length === 0) {
    return (
      <AdminSection title="Latest access">
        <p className="lead">No access events yet.</p>
      </AdminSection>
    );
  }

  const latest = events[0];
  const history = events.slice(1);

  return (
    <>
      <AdminSection title="Latest access">
        <LatestAccessTable event={latest} />
      </AdminSection>

      <AdminSection title="Access history">
        {history.length === 0 ? (
          <p className="lead">No earlier access events.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table admin-stack-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Location</th>
                  <th scope="col">IP</th>
                  <th scope="col">Device</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Network</th>
                  <th scope="col">Enrichment</th>
                </tr>
              </thead>
              <tbody>
                {history.map((event) => (
                  <HistoryRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </>
  );
}
