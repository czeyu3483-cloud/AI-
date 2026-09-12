import { NextResponse } from "next/server";
import { DEMO_ROLES, DEMO_STYLES } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ roles: DEMO_ROLES, styles: DEMO_STYLES });
}
