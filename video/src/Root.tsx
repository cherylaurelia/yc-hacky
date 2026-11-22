import { Composition } from "remotion";
import { FPS, HEIGHT, Launch, TOTAL_FRAMES, WIDTH } from "./Launch";

export const Root = () => <Composition id="Launch" component={Launch} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />;
