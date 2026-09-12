import { NextResponse } from "next/server";
import { DEMO_ROLES, DEMO_STYLES, DEMO_TRACKS } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ roles: DEMO_ROLES, styles: DEMO_STYLES, tracks: DEMO_TRACKS });
}
