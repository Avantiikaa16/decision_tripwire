import { NextResponse } from "next/server";
import { resetAndSeedDemo } from "@/lib/seed";

export async function POST() {
  try {
    const { decision, assumption } = await resetAndSeedDemo();
    return NextResponse.json({ decision, assumption });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      { status: 500 }
    );
  }
}
