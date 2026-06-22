import { createRoot } from "react-dom/client";
import * as ReactModal from "react-modal";
import App from "../components/app";

const appElt = document.getElementById("app");
ReactModal.setAppElement(appElt);

if (appElt) {
  createRoot(appElt).render(
    <App
      displayType={"line"}
    />
  );
}
