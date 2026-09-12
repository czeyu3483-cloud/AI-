import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getSession } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;
  const session = getSession(sessionId);
  if (!session?.feedback) {
    return NextResponse.json({ error: "复盘不存在" }, { status: 404 });
  }

  const doc = new jsPDF();
  let y = 16;
  const write = (text: string, size = 11) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 180) as string[];
    for (const line of lines) {
      if (y > 280) {
        doc.addPage();
        y = 16;
      }
      doc.text(line, 14, y);
      y += size * 0.5;
    }
    y += 2;
  };

  const trackLabel = session.trackId === "hr_final" ? "HR Final" : "Biz";
  write(`Mock Interview Report - R&D ${trackLabel}`, 16);
  write(`Session: ${session.id}`);
  write(`Created: ${session.createdAt}`);
  write(
    `Role: rd_general | Track: ${session.trackId || "biz"} | Style: pressure`,
  );
  if (session.feedback.vagueInsufficientDetail) {
    write("Note: answers were not detailed enough (vague / insufficient detail).");
  }
  write("Overall:");
  write(session.feedback.overallSummary);
  if (session.feedback.integrityBreach) {
    write("Integrity: SEVERE — resume authenticity red line.");
  }
  if (session.feedback.dimensions?.length) {
    write("Dimensions:");
    for (const d of session.feedback.dimensions) {
      write(`- ${d.dimension}: ${d.score}/5 (${d.band}) ${d.evidence || ""}`);
    }
  }
  for (const q of session.feedback.perQuestion) {
    write(`Q: ${q.prompt}`);
    write(`A: ${q.userAnswer}`);
    for (const s of q.scores || []) {
      write(`- ${s.dimension}: ${s.score}/5 (${s.evidence})`);
    }
    if (q.improvements?.length) write(`Improve: ${q.improvements.join("; ")}`);
  }
  write("Next actions:");
  for (const a of session.feedback.topActions || []) write(`- ${a}`);
  write("Disclaimer: practice only, no hiring decision.");

  const buf = doc.output("arraybuffer");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="interview-${sessionId}.pdf"`,
    },
  });
}
