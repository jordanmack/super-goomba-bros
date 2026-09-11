import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { loadCharacterSprites } from './game/smb-sprites';

loadCharacterSprites().then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)).catch(() => {
  document.getElementById('root')!.textContent = 'Character graphics could not load. Please reload the game.';
});
