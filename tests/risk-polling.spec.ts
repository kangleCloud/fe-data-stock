import { afterEach, describe, expect, it, vi } from "vitest";
import { createRiskPolling } from "@/utils/riskPolling";

afterEach(() => vi.useRealTimers());
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
describe("risk polling lifecycle", () => {
  it("discards old filters without overlapping requests", async () => {
    const first = deferred<string>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue("new");
    const accept = vi.fn();
    const poll = createRiskPolling({ load, accept, reject: vi.fn(), visible: () => true });
    const active = poll.refresh();
    poll.invalidate();
    expect(load).toHaveBeenCalledTimes(1);
    first.resolve("old");
    await active;
    await Promise.resolve();
    expect(accept).toHaveBeenCalledExactlyOnceWith("new");
    poll.stop();
  });
  it("does not duplicate a queued refresh after a hidden in-flight response", async () => {
    let visible = true;
    const first = deferred<string>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue("new");
    const accept = vi.fn();
    const poll = createRiskPolling({ load, accept, reject: vi.fn(), visible: () => visible, auto: false });
    const active = poll.refresh(); poll.invalidate();
    visible = false; poll.visibilityChanged(); first.resolve("hidden"); await active;
    visible = true; poll.visibilityChanged(); await Promise.resolve(); await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2); expect(accept).toHaveBeenCalledExactlyOnceWith("new"); poll.stop();
  });
  it("retains the last accepted value on failure and retries after ten seconds", async () => {
    vi.useFakeTimers();
    const accept = vi.fn();
    const reject = vi.fn();
    const load = vi.fn().mockResolvedValueOnce("good").mockRejectedValueOnce(new Error("offline")).mockResolvedValue("recovered");
    const poll = createRiskPolling({ load, accept, reject, visible: () => true });
    await poll.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(accept).toHaveBeenCalledExactlyOnceWith("good");
    expect(reject).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(accept).toHaveBeenLastCalledWith("recovered");
    poll.stop();
  });
  it("pauses while hidden and drops responses after stop", async () => {
    vi.useFakeTimers();
    let visible = false;
    const request = deferred<string>();
    const load = vi.fn(() => request.promise);
    const accept = vi.fn();
    const poll = createRiskPolling({ load, accept, reject: vi.fn(), visible: () => visible });
    await poll.refresh();
    expect(load).not.toHaveBeenCalled();
    visible = true;
    const active = poll.refresh();
    poll.stop();
    request.resolve("obsolete");
    await active;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(accept).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
