import { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { useVisibleInterval } from "../src/ui/useVisibleInterval";
function T({ fn }: { fn: () => void }) { useVisibleInterval(fn, 1000, []); return null; }
it("polling pauses while the page is hidden and refreshes on return", () => {
  vi.useFakeTimers(); let hidden = false; Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  const fn = vi.fn(); const root = createRoot(document.createElement("div")); act(() => root.render(<T fn={fn} />)); expect(fn).toHaveBeenCalledTimes(1);
  act(() => { vi.advanceTimersByTime(3000); }); expect(fn).toHaveBeenCalledTimes(4);
  hidden = true; act(() => { document.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(10_000); }); expect(fn).toHaveBeenCalledTimes(4);
  hidden = false; act(() => { document.dispatchEvent(new Event("visibilitychange")); }); expect(fn).toHaveBeenCalledTimes(5);
  act(() => root.unmount()); act(() => { vi.advanceTimersByTime(5000); }); expect(fn).toHaveBeenCalledTimes(5); vi.useRealTimers();
});
