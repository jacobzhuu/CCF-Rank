export type CCFConfidenceBand = "高" | "中" | "低";

export function getConfidenceBand(confidence: number): CCFConfidenceBand {
  if (confidence >= 90) {
    return "高";
  }

  if (confidence >= 75) {
    return "中";
  }

  return "低";
}
