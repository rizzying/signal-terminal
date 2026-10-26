import "@fontsource-variable/geist";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { Welcome } from "./ui/Welcome";

createRoot(document.getElementById("root")!).render(<Welcome />);
