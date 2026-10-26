import "../platforms/catalogue.js";

export function isVideoSender(sender, extensionId) {
  if (sender?.id !== extensionId || !Number.isInteger(sender.tab?.id) || sender.tab.id < 0 || !Number.isInteger(sender.frameId) || sender.frameId < 0) return false;
  const site = globalThis.BridgePlatforms.fromUrl(sender.url);
  return Boolean(site && (site.id !== "youtube" || sender.frameId === 0));
}
