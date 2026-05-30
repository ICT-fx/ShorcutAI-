// Remotion entry point. Both the CLI/Studio and the programmatic bundler load
// this file and pick up the compositions registered in <RemotionRoot>.
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
