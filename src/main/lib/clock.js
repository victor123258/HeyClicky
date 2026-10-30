// Uses the OS clock and ICU timezone rules, never a guessed model timestamp.
function getTime(timeZone = "", now = new Date()) {
  if (typeof timeZone !== "string" || timeZone.length > 100)
    throw Error("Use an IANA timezone such as Asia/Dubai.");
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      dateStyle: "full",
      timeStyle: "long",
      hour12: true,
    });
  } catch {
    throw Error(
      "Unknown timezone. Use an IANA name such as Asia/Dubai or Europe/London.",
    );
  }
  return {
    timeZone: formatter.resolvedOptions().timeZone,
    local: formatter.format(now),
    utc: now.toISOString(),
    source:
      "Device system clock; accuracy depends on Windows date/time synchronization.",
  };
}
module.exports = { getTime };

// A small deterministic path for simple clock questions, including the user's
// Dubai example. Unknown/ambiguous places go to the tool-enabled model, not a guess.
function timeQuestion(text, now = new Date()) {
  const match =
    /^(?:what(?:'s| is) (?:the )?(?:current )?(?:time|date)|what time (?:is it|it is)|tell me (?:the )?(?:current )?time|(?:current )?time)(?: (?:in|at|for) (.+?))?(?: (?:right )?now)?[?!.]*$/i.exec(
      text.trim(),
    );
  if (!match) return null;
  const place = (match[1] || "").replace(/[?!.]+$/, "").trim();
  const zones = {
    dubai: "Asia/Dubai",
    "abu dhabi": "Asia/Dubai",
    uae: "Asia/Dubai",
    dhaka: "Asia/Dhaka",
    london: "Europe/London",
    "new york": "America/New_York",
    tokyo: "Asia/Tokyo",
    singapore: "Asia/Singapore",
    kolkata: "Asia/Kolkata",
    utc: "UTC",
  };
  const zone = place
    ? zones[place.toLowerCase()] ||
      (/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(place) ? place : null)
    : "";
  if (zone === null) return null;
  try {
    const value = getTime(zone, now);
    return {
      ...value,
      answer: `${place ? `In ${place}` : "Your local time"}, it is ${value.local} (${value.timeZone}). Based on your computer’s clock.`,
    };
  } catch {
    return null;
  }
}
module.exports.timeQuestion = timeQuestion;
