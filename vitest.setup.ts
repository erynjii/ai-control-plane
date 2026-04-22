// Vitest setup. Runs once per test file before tests execute.
//
// Registers @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveTextContent, etc.) on Vitest's `expect`. Loaded for every test
// file regardless of environment — node-env tests don't use these
// matchers, so the import is a tiny no-op cost.

import "@testing-library/jest-dom/vitest";
