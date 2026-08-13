import { NextResponse } from "next/server";
import { processEvent } from "@/lib/tripwire";

function isValidBody(
  body: unknown
): body is { content: string; type: string; requestsPerMinute: number } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.content === "string" &&
    b.content.length > 0 &&
    b.type === "traffic_update" &&
    typeof b.requestsPerMinute === "number" &&
    Number.isFinite(b.requestsPerMinute) &&
    b.requestsPerMinute >= 0
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!isValidBody(body)) {
    return NextResponse.json(
      {
        error:
          "Expected { content: string, type: 'traffic_update', requestsPerMinute: number }",
      },
      { status: 400 }
    );
  }

  try {
    const result = await processEvent({
      content: body.content,
      type: "traffic_update",
      requestsPerMinute: body.requestsPerMinute,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Event processing failed" },
      { status: 500 }
    );
  }
}
