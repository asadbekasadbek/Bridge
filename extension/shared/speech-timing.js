// Follow video speed without changing the user's saved voice speed. Reject
// untrusted timing values and use a stable rate so prepared PCM remains useful.
export function captionRate(base, playbackRate = 1) {
  const speed = typeof playbackRate === "number" && Number.isFinite(playbackRate) ? Math.min(4, Math.max(0.25, playbackRate)) : 1;
  return Math.round(Math.min(2, Math.max(0.5, base * speed)) * 20) / 20;
}
