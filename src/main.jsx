import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import UltimateTexasHoldem from "../UltimateTexasHoldem.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <UltimateTexasHoldem />
  </StrictMode>
);
