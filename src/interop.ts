import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ForcedStyleController } from "./styles/forced.js";

/** Delivery channel: the live controller is emitted here for other extensions. */
export const STYLE_CONTROLLER_CHANNEL = "pi-response-styles:style-controller";
/** Request channel: any extension emits here (payload ignored) to receive the controller. */
export const STYLE_CONTROLLER_REQUEST_CHANNEL = "pi-response-styles:style-controller-request";

// Pi's shared bus is a plain in-process emitter without replay, so the controller is
// announced at load and re-emitted for every request. A consumer subscribes to the
// delivery channel first and then requests, which works whatever the load order.
export function registerStyleControllerInterop(pi: ExtensionAPI, controller: ForcedStyleController): void {
  pi.events.on(STYLE_CONTROLLER_REQUEST_CHANNEL, () => {
    pi.events.emit(STYLE_CONTROLLER_CHANNEL, controller);
  });
  pi.events.emit(STYLE_CONTROLLER_CHANNEL, controller);
}
