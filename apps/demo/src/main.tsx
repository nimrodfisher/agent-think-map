import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./demo.css";
import "@agent-think-map/react/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
