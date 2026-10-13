import { act } from "react";
import { createRoot } from "react-dom/client";
import { clampNum, NumField } from "../src/ui/NumField";
import { getLev, setLev } from "../src/leverage";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const type = (el: HTMLInputElement, v: string) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
describe("leverage input (regression: couldn't edit leverage)", () => {
  it("clampNum", () => { expect(clampNum("", 1, 40, 1, 5)).toBe(5); expect(clampNum("25", 1, 40, 1, 5)).toBe(25); expect(clampNum("99", 1, 40, 1, 5)).toBe(40); expect(clampNum("0", 1, 40, 1, 5)).toBe(1); expect(clampNum("2,5", 0, 3, 0.5, 1)).toBe(2.5); });
  it("allows clearing and typing freely; clamps only on blur/Enter; steppers", async () => {
    const div = document.createElement("div"); document.body.appendChild(div); const got: number[] = []; let val = 5;
    const root = createRoot(div); const render = () => root.render(<NumField label="Lev" min={1} max={40} steppers value={val} onCommit={(v) => { got.push(v); val = v; render(); }} />);
    await act(async () => render()); const el = div.querySelector("input")!;
    await act(async () => { el.focus(); type(el, ""); }); expect(el.value).toBe(""); expect(got).toEqual([]); // cleared, not reset to 1
    await act(async () => { type(el, "1"); }); await act(async () => { type(el, "10"); }); expect(el.value).toBe("10"); expect(got).toEqual([]);
    await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }); expect(got).toEqual([10]);
    await act(async () => { el.focus(); type(el, "250"); el.blur(); }); expect(got.at(-1)).toBe(40); expect(el.value).toBe("40");
    await act(async () => { el.focus(); type(el, ""); el.blur(); }); expect(el.value).toBe("40"); // empty on blur → keeps last value
    await act(async () => { (div.querySelector('[aria-label="Decrease Lev"]') as HTMLButtonElement).click(); }); expect(got.at(-1)).toBe(39);
    expect(el.inputMode).toBe("decimal"); root.unmount();
  });
  it("is saved per strategy", () => { setLev("b-default", 10); setLev("my-1", 25); expect(getLev("b-default", 5)).toBe(10); expect(getLev("my-1", 5)).toBe(25); expect(getLev("b-smc", 5)).toBe(5); });
});
