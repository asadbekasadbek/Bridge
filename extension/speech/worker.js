import { VoiceModel } from "./model.js";
import { createSynthesisEngine } from "./engine.js";
import { packById } from "../shared/voice-pack-catalogue.js";
const engine = createSynthesisEngine({
  languageFor: id => packById(id)?.lang || "",
  async loadModel(progress, modelId) { const model = new VoiceModel(); await model.load(progress, modelId); return model; },
  post: (message, transfer = []) => self.postMessage(message, transfer)
});
self.onmessage = ({ data }) => { engine.handle(data); };
