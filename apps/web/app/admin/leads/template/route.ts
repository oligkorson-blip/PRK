import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { leadsCsvTemplateContent } from "@/lib/leads/csv";

export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }

  const body = leadsCsvTemplateContent();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads-template.csv"'
    }
  });
}
