/** Short class code for standings / broadcast tags. */
export function classTagShortLabel(classId: string): string {
  switch (classId) {
    case "Hypercar":
      return "HYP";
    case "LMP2":
      return "P2";
    case "LMGT3":
      return "GT3";
    default:
      return classId.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "?";
  }
}
