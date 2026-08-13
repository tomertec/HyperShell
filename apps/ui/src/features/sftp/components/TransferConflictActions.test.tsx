import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TransferConflictActions } from "./TransferConflictActions";

describe("TransferConflictActions", () => {
  it("offers every resolution and reports which was chosen", async () => {
    const onResolve = vi.fn();
    render(<TransferConflictActions transferId="t1" onResolve={onResolve} />);

    await userEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "overwrite", false);

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "skip", false);

    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "rename", false);
  });

  it("marks the apply-to-all variants distinctly", async () => {
    const onResolve = vi.fn();
    render(<TransferConflictActions transferId="t1" onResolve={onResolve} />);

    await userEvent.click(screen.getByRole("button", { name: "Overwrite all" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "overwrite", true);

    await userEvent.click(screen.getByRole("button", { name: "Skip all" }));
    expect(onResolve).toHaveBeenCalledWith("t1", "skip", true);
  });
});
