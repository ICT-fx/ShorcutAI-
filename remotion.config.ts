// Remotion CLI / Studio config. The programmatic renderer in the worker
// (src/lib/render/render.ts) configures itself separately via renderMedia().
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// H.264 MP4 is the cheapest, most compatible delivery codec.
Config.setCodec("h264");
// Concurrency left to Remotion's default (≈ CPU cores) to keep render cheap/local.
