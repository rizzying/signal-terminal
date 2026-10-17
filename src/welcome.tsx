import "@fontsource-variable/inter";
import "@fontsource/space-grotesk/700.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { Welcome } from "./ui/Welcome";

createRoot(document.getElementById("root")!).render(<Welcome />);
