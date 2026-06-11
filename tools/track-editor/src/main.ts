import { TrackEditorApp } from "./TrackEditorApp";

const container = document.getElementById("app");
if (!container) {
  throw new Error("#app missing");
}

new TrackEditorApp(container);
