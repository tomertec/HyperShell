import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
  );
}

describe("test toolchain smoke test", () => {
  it("renders and reacts to user interaction", async () => {
    const user = userEvent.setup();
    render(<Counter />);

    const button = screen.getByRole("button", { name: "Count: 0" });
    expect(button).toBeDefined();

    await user.click(button);

    expect(screen.getByRole("button", { name: "Count: 1" })).toBeDefined();
  });
});
