import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { structureResume } from "@/lib/deepseek";
import type { ResumeProfile } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let rawText = "";
    let source: ResumeProfile["parseMeta"]["source"] = "paste";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const textField = form.get("text");
      const file = form.get("file");
      if (typeof textField === "string" && textField.trim()) {
        rawText = textField;
        source = "paste";
      } else if (file instanceof File) {
        const name = file.name.toLowerCase();
        const buf = Buffer.from(await file.arrayBuffer());
        if (name.endsWith(".txt") || name.endsWith(".md")) {
          rawText = buf.toString("utf-8");
          source = "txt";
        } else if (name.endsWith(".docx")) {
          rawText = (await mammoth.extractRawText({ buffer: buf })).value;
          source = "docx";
        } else if (name.endsWith(".pdf")) {
          const mod = await import("pdf-parse");
          const pdfParse =
            (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default ||
            (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
          rawText = (await pdfParse(buf)).text || "";
          source = "pdf";
          if (!rawText.trim()) {
            return NextResponse.json(
              { error: "PDF 未能提取文本（可能是扫描件），请改用粘贴或 Word" },
              { status: 400 },
            );
          }
        } else {
          return NextResponse.json({ error: "仅支持 txt/docx/pdf" }, { status: 400 });
        }
      }
    } else {
      const body = (await req.json()) as { text?: string };
      rawText = body.text || "";
      source = "paste";
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: "简历内容为空" }, { status: 400 });
    }

    const profile = await structureResume(rawText, source);
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "解析失败" },
      { status: 500 },
    );
  }
}
