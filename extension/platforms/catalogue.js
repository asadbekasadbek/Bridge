(() => {
  const sites = [
    { id: "youtube", name: "YouTube", hosts: ["youtube.com", "www.youtube.com"], players: ".html5-video-player" },
    { id: "ted", name: "TED", hosts: ["ted.com", "www.ted.com", "embed.ted.com"], players: "media-controller, #video-player-container, .video-js, .plyr", captions: ".vjs-text-track-display, .plyr__captions, [data-testid='subtitles']", cc: "media-captions-button, [aria-label*='Subtitles'], [aria-label*='Captions']" },
    { id: "vimeo", name: "Vimeo", hosts: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"], players: ".player, #player, .video-js", captions: ".captions-text, .vp-captions, .vp-caption", cc: "[data-cc-button], .cc, [aria-label*='Subtitles']" },
    { id: "udemy", name: "Udemy", hosts: ["udemy.com", "*.udemy.com"], players: "[data-purpose='shaka-video-player'], [data-purpose='video-player'], [data-purpose='video-player-wrapper'], .video-js", captions: "[data-purpose='captions-cue-text'], [data-purpose='captions-display'], [class*='captions-display--captions-container'], [class*='captions-display-module--captions-container']", menus: "[class*='video-control-bar-dropdown-module--scrollable-tracks'] [role='group']", cc: "[data-purpose='captions-dropdown-button'], [data-purpose='captions-button'], [aria-label*='Captions']" },
    { id: "coursera", name: "Coursera", hosts: ["coursera.org", "www.coursera.org"], players: ".rc-VideoPlayer, .video-js, [data-testid='video-player']", captions: ".vjs-text-track-display, .rc-Captions, [data-testid='captions']", cc: ".vjs-subs-caps-button button, .vjs-subs-caps-button, [aria-label*='Subtitles']" },
    { id: "vk", name: "VK Видео", hosts: ["vk.com", "www.vk.com", "m.vk.com", "vkvideo.ru", "www.vkvideo.ru"], shadowHosts: ".shadow-root-container, vk-video-player", players: ".vk-vp-root, .videoplayer, .VideoPlayer, [data-testid='video-player']", captions: ".videoplayer_subtitles, .videoplayer_captions, .VideoPlayerSubtitles, [data-testid='subtitles']", cc: "[data-testid='subtitles-btn'], .videoplayer_btn_subtitles, [aria-label*='Субтитры'], [aria-label*='Subtitles']" },
    { id: "rutube", name: "RUTUBE", hosts: ["rutube.ru", "www.rutube.ru"], players: ".video-player, .video-player-container, [data-testid='player'], #player", captions: "[class*='subtitles-module__'], [class*='captions-module__'], .subtitles, .captions", cc: "[aria-label*='Субтитры'], [aria-label*='субтитры'], [aria-label*='subtitles' i], [data-testid='subtitles-button']", settings: "[data-testid='settingsButton']" },
    { id: "twitch", name: "Twitch", hosts: ["twitch.tv", "www.twitch.tv", "player.twitch.tv", "clips.twitch.tv"], players: ".video-player, [data-a-target='video-player']", captions: ".captions-line, [data-a-target='player-captions-container']", cc: "[data-a-target='player-closed-caption-button'], [aria-label*='Closed Captions'], [aria-label*='Субтитры']" }
  ].map((site) => Object.freeze({ ...site, hosts: Object.freeze(site.hosts) }));
  function fromUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return null;
      return sites.find((site) => site.hosts.some((host) => host.startsWith("*.") ? url.hostname.endsWith(host.slice(1)) : url.hostname === host)) || null;
    } catch { return null; }
  }
  globalThis.BridgePlatforms = Object.freeze({ sites: Object.freeze(sites), fromUrl });
})();
