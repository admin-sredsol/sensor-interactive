import { createRoot } from "react-dom/client";
import * as ReactModal from "react-modal";
import App from "./components/app";

const appElt = document.getElementById("app");
ReactModal.setAppElement(appElt);

// Allow enabling a fake sensor via a URL parameter (?fakeSensor=true) so the app
// can be tested without real sensor hardware, for example when running as a CODAP plugin.
const params = new URLSearchParams(window.location.search);
const fakeSensor = params.get("fakeSensor") === "true";

if (appElt) {
  createRoot(appElt).render(
    // By default we will be using sensors.
    <App useSensors={true} displayType={"line"} fakeSensor={fakeSensor}/>
  );
}