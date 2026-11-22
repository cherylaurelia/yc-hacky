import { Composition } from "remotion";
import { Terminal1Demo, DEMO_FRAMES } from "./Demo";
import { FPS, HEIGHT, Launch, TOTAL_FRAMES, WIDTH } from "./Launch";

export const Root = () => (
  <>
    <Composition id="Launch" component={Launch} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="Terminal1Demo" component={Terminal1Demo} durationInFrames={DEMO_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
