import type { InterviewPhase } from "./types";

export function phaseLabel(phase: InterviewPhase): string {
  switch (phase) {
    case "resume_research":
      return "简历调研";
    case "resume_deep_dive":
      return "简历深挖";
    case "professional_knowledge":
      return "专业题";
    case "coding":
      return "编程";
    case "hr_fit":
      return "适配与动机";
    default:
      return phase;
  }
}
