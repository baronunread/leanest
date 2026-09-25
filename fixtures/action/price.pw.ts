import { price } from "./price";

// Never executed: CI swaps Playwright for a stub that only records its arguments.
export const expected = price(1999) === "$19.99";
