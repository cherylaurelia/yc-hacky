import { Composition } from "remotion";
import { CoworkerDemo, DEMO_FRAMES } from "./Demo";
import { FPS, HEIGHT, Launch, TOTAL_FRAMES, WIDTH } from "./Launch";

export const Root = () => (
  <>
    <Composition id="Launch" component={Launch} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="CoworkerDemo" component={CoworkerDemo} durationInFrames={DEMO_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
