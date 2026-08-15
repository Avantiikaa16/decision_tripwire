import { NextResponse } from "next/server";
import { processEvent, type TripwireInput } from "@/lib/tripwire";

function isValidBody(body: unknown): body is TripwireInput {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.content !== "string" || b.content.length === 0) return false;
  if (b.type !== "traffic_update" && b.type !== "operational_evidence") return false;

  if (b.structuredData === null) return true;
  if (!b.structuredData || typeof b.structuredData !== "object") return false;
  const sd = b.structuredData as Record<string, unknown>;
  return (
    typeof sd.metric === "string" &&
    typeof sd.value === "number" &&
    Number.isFinite(sd.value)
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isValidBody(body)) {
    return NextResponse.json(
      {
        error:
          "Expected { content: string, type: 'traffic_update' | 'operational_evidence', structuredData: { metric: string, value: number } | null }",
      },
      { status: 400 }
    );
  }

  try {
    const result = await processEvent(body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Event processing failed" },
      { status: 500 }
    );
  }
}
