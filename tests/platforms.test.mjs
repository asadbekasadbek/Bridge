import test from "node:test";
import assert from "node:assert/strict";
import { isVideoSender } from "../extension/shared/video-sites.js";

const { sites, fromUrl } = globalThis.BridgePlatforms;
test("все площадки распознаются по точным HTTPS-доменам, Udemy поддерживает корпоративные поддомены", () => {
  assert.equal(sites.length, 8);
  for (const [url, id] of [["https://www.youtube.com/watch?v=test", "youtube"], ["https://www.ted.com/talks/test", "ted"], ["https://embed.ted.com/talks/test", "ted"], ["https://player.vimeo.com/video/1", "vimeo"], ["https://example.udemy.com/course/test", "udemy"], ["https://www.coursera.org/learn/test", "coursera"], ["https://vkvideo.ru/video-1_1", "vk"], ["https://vk.com/video-1_1", "vk"], ["https://rutube.ru/play/embed/123", "rutube"], ["https://player.twitch.tv/?channel=test", "twitch"]]) assert.equal(fromUrl(url)?.id, id);
  for (const url of ["http://www.ted.com/talks/test", "https://ted.com.evil.test/", "https://eviludemy.com/", "https://udemy.com.evil.test/", "https://vimeo.com@evil.test/", "javascript:alert(1)", "invalid"]) assert.equal(fromUrl(url), null);
});
test("доступ к голосу имеют только свои контент-скрипты на поддерживаемых страницах и фреймах", () => {
  const sender = { id: "bridge", tab: { id: 10 }, frameId: 4, url: "https://player.vimeo.com/video/1" };
  assert.equal(isVideoSender(sender, "bridge"), true);
  for (const override of [{ id: "other" }, { tab: { id: -1 } }, { frameId: -1 }, { frameId: undefined }, { url: "https://player.vimeo.com.evil.test/video/1" }, { url: "https://www.youtube.com/watch?v=test" }]) assert.equal(isVideoSender({ ...sender, ...override }, "bridge"), false);
});
