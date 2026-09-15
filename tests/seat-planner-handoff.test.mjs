import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("seat planner handoff is restricted and bounded", () => {
  assert.match(source, /const SEAT_PLANNER_ORIGIN = "https:\/\/erakeun\.github\.io"/);
  assert.match(source, /data\.source !== "erica-seat-planner"/);
  assert.match(source, /event\.source !== window\.opener/);
  assert.match(source, /data\.people\.length > 63/);
  assert.match(source, /transfer\.source\?\.postMessage\(\{/);
  assert.match(source, /erica-seat-planner:nameplates:accepted/);
});

test("handoff does not read attendee data from the URL", () => {
  const handoff = source.match(/const SEAT_PLANNER_ORIGIN[^]*?if \("ResizeObserver" in window\)/)?.[0] || "";
  assert.ok(handoff);
  assert.doesNotMatch(handoff, /URLSearchParams|location\.search|location\.hash/);
});
