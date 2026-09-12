import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { conflictLevelLabel } from "@/lib/resumeConflict";
import { getSession } from "@/lib/store";
import type { ResumeConflictLevel } from "@/lib/types";

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

  const fb = session.feedback;
  const trackLabel = session.trackId === "hr_final" ? "HR Final" : "Biz";
  write(`Mock Interview Report - R&D ${trackLabel}`, 16);
  write(`Session: ${session.id}`);
  write(`Created: ${session.createdAt}`);
  write(
    `Role: rd_general | Track: ${session.trackId || "biz"} | Style: pressure`,
  );
  if (fb.recommendation) write(`Recommendation: ${fb.recommendation}`);
  if (fb.integrityRiskFlag) write("Integrity risk flag: YES");
  if (fb.vagueInsufficientDetail) {
    write("Note: answers were not detailed enough (vague / insufficient detail).");
  }
  write("Overall:");
  write(fb.overallSummary);
  if (fb.integrityBreach) {
    write("Integrity: SEVERE — resume authenticity red line.");
  }
  if (fb.resumeConflicts?.length) {
    write("Resume conflicts:");
    for (const c of fb.resumeConflicts) {
      write(
        `- L${c.level} ${conflictLevelLabel(c.level as ResumeConflictLevel)} [${c.kind}] resume="${c.resumeSide}" answer="${c.answerSide}" outcome=${c.explainOutcome || "—"}`,
      );
      if (c.resumeExcerpt) write(`  excerpt: ${c.resumeExcerpt}`);
    }
  }
  if (fb.inconsistencies?.length) {
    write("Consistency issues by severity:");
    for (const sev of ["high", "medium", "low"] as const) {
      const items = fb.inconsistencies.filter((i) => i.severity === sev);
      if (!items.length) continue;
      write(`- ${sev}:`);
      for (const i of items) {
        write(`  · [${i.field}] ${i.issue}${i.explainOutcome ? ` (${i.explainOutcome})` : ""}`);
      }
    }
  }
  if (fb.techCorrectnessNotes?.length) {
    write("Tech correctness:");
    for (const n of fb.techCorrectnessNotes) write(`- [${n.severity}] ${n.note}`);
  }
  if (fb.codingResults?.length) {
    write("Coding:");
    for (const cr of fb.codingResults) {
      write(
        `- ${cr.title}: ${cr.passed ? "PASS" : "FAIL"} ${cr.passedCount}/${cr.total}; ${cr.complexityNotes || ""}`,
      );
    }
  }
  if (fb.dimensions?.length) {
    write("Dimensions:");
    for (const d of fb.dimensions) {
      write(`- ${d.dimension}: ${d.score}/5 (${d.band}) ${d.evidence || ""}`);
    }
  }
  for (const q of fb.perQuestion) {
    write(`Q: ${q.prompt}`);
    write(`A: ${q.userAnswer}`);
    for (const s of q.scores || []) {
      write(`- ${s.dimension}: ${s.score}/5 (${s.evidence})`);
    }
    if (q.improvements?.length) write(`Improve: ${q.improvements.join("; ")}`);
  }
  if (fb.nextRoundAdvice?.length) {
    write("Next-round advice:");
    for (const a of fb.nextRoundAdvice) write(`- ${a}`);
  }
  write("Next actions:");
  for (const a of fb.topActions || []) write(`- ${a}`);
  if (fb.resumeRawExcerpt) {
    write("Resume raw excerpt:");
    write(fb.resumeRawExcerpt);
  }
  write("Disclaimer: practice only, no hiring decision.");

  const buf = doc.output("arraybuffer");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="interview-${sessionId}.pdf"`,
    },
  });
}
