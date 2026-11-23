// Lets plain Node import the app's TypeScript: `@/x` -> <root>/x, and extensionless relative imports -> .ts.
import * as nodeModule from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Resolved = { url: string };
type Next = (spec: string, ctx: unknown) => Resolved;
// registerHooks is in Node 23.5+; this repo's @types/node predates it.
const { registerHooks } = nodeModule as unknown as { registerHooks(h: { resolve(spec: string, ctx: unknown, next: Next): Resolved }): void };

const ROOT = resolve(import.meta.dirname, "../..");
const HAS_EXT = /\.(?:[cm]?[jt]sx?|json)$/;

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) spec = pathToFileURL(join(ROOT, spec.slice(2))).href;
    if ((spec.startsWith(".") || spec.startsWith("file:")) && !HAS_EXT.test(spec)) {
      try {
        return next(`${spec}.ts`, ctx);
      } catch {
        return next(spec, ctx);
      }
    }
    return next(spec, ctx);
  },
});
