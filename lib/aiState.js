// Simulates the AI suggestion dependency's health. Toggled via the dev-only
// /dev/break-ai and /dev/fix-ai endpoints so Degradation Proof evidence can
// be captured on demand instead of waiting for a real outage.

let broken = false;

function markBroken() {
  broken = true;
}

function markFixed() {
  broken = false;
}

function isBroken() {
  return broken;
}

module.exports = { markBroken, markFixed, isBroken };
