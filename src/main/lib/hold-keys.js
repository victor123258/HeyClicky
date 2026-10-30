const KEYS = {
  Space: 32,
  Enter: 13,
  Tab: 9,
  Escape: 27,
  Backspace: 8,
  Up: 38,
  Down: 40,
  Left: 37,
  Right: 39,
  Home: 36,
  End: 35,
  Delete: 46,
  PageUp: 33,
  PageDown: 34,
};
function keyGroups(accelerator) {
  if (typeof accelerator !== "string") throw Error("Invalid voice shortcut.");
  return accelerator.split("+").map((part) => {
    if (/^(CommandOrControl|Control|Ctrl)$/i.test(part)) return [17];
    if (/^Shift$/i.test(part)) return [16];
    if (/^(Alt|Option)$/i.test(part)) return [18];
    if (/^(Super|Meta|Win|Command)$/i.test(part)) return [91, 92];
    const named = Object.keys(KEYS).find(
      (k) => k.toLowerCase() === part.toLowerCase(),
    );
    if (named) return [KEYS[named]];
    if (/^[a-z0-9]$/i.test(part)) return [part.toUpperCase().charCodeAt(0)];
    if (/^F([1-9]|1\d|2[0-4])$/i.test(part))
      return [111 + Number(part.slice(1))];
    throw Error(
      "Hold-to-talk shortcuts support modifiers with letters, numbers, function keys, Space, Enter, Tab or navigation keys.",
    );
  });
}
module.exports = { keyGroups };
