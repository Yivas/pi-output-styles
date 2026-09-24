/* eslint-disable no-control-regex -- this module exists precisely to strip control characters */
/**
 * Terminal control sequences must never reach the TUI from style content: a repository can
 * ship `.pi/output-styles/*.md` files, so their text is untrusted input for the terminal
 * (screen clearing, cursor moves, title spoofing, OSC 8 links, OSC 52 clipboard writes).
 *
 * The style text that goes into the model prompt is separate and stays as written; this
 * helper protects what gets painted or echoed back to the user, keeping the printable
 * characters around a sequence. An unterminated string sequence is dropped to the end of the
 * text: its payload is not printable content.
 */
export function stripControlSequences(text: string): string {
  return (
    text
      // Operating system commands: ESC ] ... terminated by BEL or ST, or to the end.
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\|$)/g, "")
      // Device control and other string commands (DCS, SOS, PM, APC).
      .replace(/\u001b[P^_X][^\u001b]*(?:\u001b\\|$)/g, "")
      // Control sequence introducers (CSI), in both the ESC [ and the C1 single-byte form.
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
      .replace(/\u009b[0-?]*[ -/]*[@-~]/g, "")
      // Any other escape sequence: intermediate bytes then a final byte (ESC ( B, ESC # 8, ESC 7).
      .replace(/\u001b[ -/]*[0-~]/g, "")
      // Remaining C0 and C1 controls, keeping tab and newline.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "")
      // Invisible formatting that reorders or hides what the user reads: bidi controls and the
      // zero-width space. The zero-width joiner (U+200D) holds emoji together and the
      // non-joiner (U+200C) is required by Persian and Indic scripts, so both stay.
      .replace(/[\u200b\u202a-\u202e\u2066-\u2069]/g, "")
  );
}
