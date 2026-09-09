import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ============================================================================
// Client-side download protection
// Blocks: right-click context menu, F12, Ctrl+Shift+I/J/C, Ctrl+U, drag images
// Note: This is a deterrent, not a guarantee. Determined users can bypass.
// ============================================================================

// Disable right-click context menu
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Disable developer tools keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // F12
  if (e.key === "F12") {
    e.preventDefault();
    return;
  }
  // Ctrl+Shift+I (Inspector), Ctrl+Shift+J (Console), Ctrl+Shift+C (Element picker)
  if (
    e.ctrlKey &&
    e.shiftKey &&
    ["I", "J", "C"].includes(e.key.toUpperCase())
  ) {
    e.preventDefault();
    return;
  }
  // Ctrl+U (View Source)
  if (e.ctrlKey && e.key.toUpperCase() === "U") {
    e.preventDefault();
    return;
  }
  // Ctrl+S (Save Page)
  if (e.ctrlKey && e.key.toUpperCase() === "S") {
    e.preventDefault();
  }
});

// Disable image dragging (prevents easy download of assets)
document.addEventListener("dragstart", (e) => {
  if (e.target instanceof HTMLImageElement) {
    e.preventDefault();
  }
});

// Disable text selection on non-input elements (prevents copy-paste of content)
document.addEventListener("selectstart", (e) => {
  const target = e.target as HTMLElement;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return; // Allow selection in input fields
  }
  e.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
