/* eslint-disable no-control-regex -- this module exists precisely to strip control characters */
/**
 * Terminal control sequences must never reach the TUI from style content: a repository can
 * ship `.pi/output-styles/*.md` files, so their text is untrusted input for the terminal
 * (screen clearing, cursor moves, title spoofing, OSC 8 links, OSC 52 clipboard writes).
 *
 * The style text that goes into the model prompt is separate and stays as written; this
 * helper protects what gets painted, keeping the printable characters around a sequence.
 */
export function stripControlSequences(text: string): string {
  return (
    text
      // Operating system commands: ESC ] ... terminated by BEL or ST.
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
      // Control sequence introducers (CSI) and their parameters.
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
      // Any other two-character ESC sequence.
      .replace(/\u001b[@-Z\\-_]/g, "")
      // Remaining C0 and C1 controls, keeping tab and newline.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
  );
}
