import { describe, expect, it } from "vitest";
import { fmtDay, fmtEur, fmtNum, fmtSignedEur, tidy } from "./format";

describe("formattazione dei numeri", () => {
  it("punto delle migliaia anche a 4 cifre e meno tipografico", () => {
    expect(fmtEur(9055.2)).toBe("9.055,20 €");
    expect(fmtEur(-1374.63)).toBe("−1.374,63 €");
    expect(fmtEur(11282.65)).toBe("11.282,65 €");
    expect(fmtSignedEur(2469.86)).toBe("+2.469,86 €");
    expect(fmtNum(2300)).toBe("2.300");
  });
  it("non tocca i decimali né i numeri piccoli", () => {
    expect(tidy("0,1234")).toBe("0,1234");
    expect(tidy("123,45 €")).toBe("123,45 €");
  });
  it("date brevi per le liste", () => {
    expect(fmtDay("2025-01-15", false)).toBe("15 gen");
    expect(fmtDay("2025-01-15", true)).toBe("15 gen 25");
  });
});
