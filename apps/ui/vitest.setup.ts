import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library only auto-registers its cleanup when a global
// `afterEach` exists (i.e. `test.globals: true`). This project does not enable
// globals, so without this file every `.test.tsx` with more than one test case
// leaks the previous test's DOM into the next one.
afterEach(() => {
  cleanup();
});
