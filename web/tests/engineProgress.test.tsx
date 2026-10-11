import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineProgress } from "../src/components/workspace/EngineProgress";
import { resetEngineClient, warmEngine } from "../src/lib/engineClient";
import { FakeWorker } from "./fakeWorker";

const downloading = { phase: "loading", stage: "download", loaded: 1_048_576, total: 4_194_304 } as const;

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  resetEngineClient();
  vi.unstubAllGlobals();
});

describe("EngineProgress", () => {
  it("shows no warning at first", () => {
    render(<EngineProgress status={downloading} />);
    expect(screen.queryByText(/longer than usual/)).not.toBeInTheDocument();
  });

  it("offers a retry after a stage drags on, and retrying restarts the engine", () => {
    warmEngine();
    render(<EngineProgress status={downloading} />);
    act(() => void vi.advanceTimersByTime(25_000));
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
    const before = FakeWorker.instances.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(FakeWorker.instances.length).toBe(before + 1);
  });

  it("starts the wait again when the stage changes", () => {
    const { rerender } = render(<EngineProgress status={downloading} />);
    act(() => void vi.advanceTimersByTime(25_000));
    expect(screen.getByText(/longer than usual/)).toBeInTheDocument();
    rerender(<EngineProgress status={{ ...downloading, stage: "start" }} />);
    expect(screen.queryByText(/longer than usual/)).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(25_000));
    expect(screen.getByText(/longer than usual/)).toBeInTheDocument();
  });
});
