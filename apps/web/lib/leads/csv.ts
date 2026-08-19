export const LEADS_CSV_HEADERS = [
  "full_name",
  "email",
  "phone",
  "source",
  "source_detail",
  "notes",
] as const;

export type ParsedLeadRow = {
  fullName: string;
  email: string;
  phone: string | null;
  source: string;
  sourceDetail: string | null;
  notes: string | null;
};

export type ParseLeadsCsvError = {
  line: number;
  message: string;
};

export type ParseLeadsCsvResult = {
  ok: ParsedLeadRow[];
  errors: ParseLeadsCsvError[];
};

/** Same rule as updateLeadDetails — keep both validations from drifting apart. */
export const LEAD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function leadsCsvTemplateContent(): string {
  const example = [
    "Ada Lovelace",
    "ada@example.com",
    "555-0100",
    "referral",
    "friend",
    "Optional notes",
  ].join(",");
  return `${LEADS_CSV_HEADERS.join(",")}\n${example}\n`;
}

/**
 * Split raw CSV text into records. Newlines inside a quoted cell do not end a
 * record, so a quoted note with an embedded newline stays one row. Quotes are
 * preserved for splitCsvLine to unescape.
 */
function splitCsvRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      current += ch;
      if (inQuotes && text[i + 1] === '"') {
        current += text[i + 1];
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      records.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  records.push(current);
  return records;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function optionalCell(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseLeadsCsv(
  text: string,
  opts: { defaultSource: string },
): ParseLeadsCsvResult {
  const ok: ParsedLeadRow[] = [];
  const errors: ParseLeadsCsvError[] = [];
  const lines = splitCsvRecords(text.replace(/^\uFEFF/, ""));

  let startIndex = 0;
  while (startIndex < lines.length && lines[startIndex].trim() === "") {
    startIndex++;
  }
  if (startIndex >= lines.length) {
    return { ok, errors };
  }

  // Skip header row when present
  const firstCells = splitCsvLine(lines[startIndex]).map((c) => c.trim());
  if (
    firstCells.length >= LEADS_CSV_HEADERS.length &&
    LEADS_CSV_HEADERS.every((h, i) => firstCells[i] === h)
  ) {
    startIndex++;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;

    const lineNumber = i + 1;
    const cells = splitCsvLine(raw).map((c) => c.trim());
    const fullName = cells[0] ?? "";
    const emailRaw = cells[1] ?? "";
    const phone = optionalCell(cells[2]);
    const sourceCell = optionalCell(cells[3]);
    const sourceDetail = optionalCell(cells[4]);
    const notes = optionalCell(cells[5]);

    if (fullName.length < 1) {
      errors.push({ line: lineNumber, message: "full_name is required" });
      continue;
    }

    if (!emailRaw || !LEAD_EMAIL_RE.test(emailRaw)) {
      errors.push({ line: lineNumber, message: "email is required" });
      continue;
    }

    const source = sourceCell ?? opts.defaultSource.trim();
    if (!source) {
      errors.push({
        line: lineNumber,
        message: "source is required (cell or defaultSource)",
      });
      continue;
    }

    ok.push({
      fullName,
      email: emailRaw.toLowerCase(),
      phone,
      source,
      sourceDetail,
      notes,
    });
  }

  return { ok, errors };
}
