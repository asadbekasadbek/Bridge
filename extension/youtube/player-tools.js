(() => {
  function visible(element) {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }
  function findSurface(doc = document, path = location.pathname) {
    const shorts = path.startsWith("/shorts/");
    const candidates = doc.querySelectorAll(shorts ? "#shorts-player, ytd-reel-video-renderer .html5-video-player, yt-reel-video-renderer .html5-video-player" : "#movie_player, .html5-video-player");
    const area = (element) => {
      const box = element.getBoundingClientRect();
      return Math.max(0, Math.min(innerWidth, box.right) - Math.max(0, box.left)) * Math.max(0, Math.min(innerHeight, box.bottom) - Math.max(0, box.top));
    };
    let player = null, video = null, largest = -1;
    for (const candidate of candidates) {
      const candidateVideo = candidate.querySelector("video");
      if (!candidateVideo || !visible(candidate)) continue;
      const visibleArea = area(candidate);
      if (visibleArea > largest) { player = candidate; video = candidateVideo; largest = visibleArea; }
    }
    if (!player || (shorts && !largest)) return null;
    const scope = shorts ? player.closest("ytd-reel-video-renderer, yt-reel-video-renderer") || player : player;
    // Shorts metadata is a sibling overlay above the player's stacking context
    // (the player itself has z-index: 0). Mount beside it, not inside it.
    const overlayParent = doc.fullscreenElement?.contains(player) ? doc.fullscreenElement : scope;
    return { player, video, controls: shorts ? overlayParent : player.querySelector(".ytp-right-controls"), scope, shorts };
  }
  globalThis.BridgePlayerTools = Object.freeze({ findSurface });
})();
