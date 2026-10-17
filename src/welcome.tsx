import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { Welcome } from "./ui/Welcome";

createRoot(document.getElementById("root")!).render(<Welcome />);
