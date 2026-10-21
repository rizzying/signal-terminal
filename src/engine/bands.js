export function confidenceCuts(n) {
  return n > 70 ? "High" : n >= 50 ? "Medium" : "Low";
}
