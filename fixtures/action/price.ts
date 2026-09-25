// Fixture for the Action smoke test in CI. CI edits this file so the test below is selected.
export const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
