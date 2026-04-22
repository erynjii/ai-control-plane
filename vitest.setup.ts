// Vitest setup. Runs once per test file before tests execute.
//
// - Registers @testing-library/jest-dom matchers on Vitest's `expect`.
// - Auto-cleans RTL renders between tests (jsdom tests only; a no-op in
//   node env tests since nothing is mounted).

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
