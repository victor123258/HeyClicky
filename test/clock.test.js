const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getTime, timeQuestion } = require("../src/main/lib/clock");
const now = new Date("2026-10-30T12:15:00Z");
test("Dubai clock uses Asia/Dubai UTC+4, including local date rollover", () => {
  const time = getTime("Asia/Dubai", now);
  assert.match(time.local, /4:15:00 PM/);
  assert.equal(time.timeZone, "Asia/Dubai");
  assert.equal(time.utc, now.toISOString());
  assert.match(
    getTime("Asia/Dubai", new Date("2026-10-30T22:00:00Z")).local,
    /Saturday, October 31/,
  );
});
test("IANA clock handles daylight-saving transitions and invalid zones", () => {
  assert.match(getTime("America/New_York", now).local, /8:15:00 AM/);
  assert.match(
    getTime("America/New_York", new Date("2026-11-02T12:15:00Z")).local,
    /7:15:00 AM/,
  );
  assert.throws(() => getTime("Dubai"), /Unknown timezone/);
  assert.throws(() => getTime(123));
});
test("Simple Dubai questions get deterministic answers; ambiguous/live facts do not get guessed", () => {
  for (const question of [
    "what time it is in dubai?",
    "What time is it in Dubai?",
    "What is the time in Dubai?",
    "time in Dubai now?",
  ]) {
    assert.match(timeQuestion(question, now).answer, /4:15:00 PM/);
    assert.equal(timeQuestion(question, now).timeZone, "Asia/Dubai");
  }
  for (const question of [
    "what time is it in Springfield?",
    "what is the weather in Dubai?",
    "time in Invalid/Zone?",
    "open my clock app",
  ])
    assert.equal(timeQuestion(question, now), null);
});
