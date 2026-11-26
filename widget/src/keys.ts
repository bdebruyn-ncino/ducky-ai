// A plain character key means the user wants to type, so the text box should appear.
// Shortcuts (with Cmd, Ctrl or Alt) are left alone, and so is Space on a focused button, where it presses the button.
export function startsTyping(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean },
  focusIsOnButton: boolean,
): boolean {
  const isCharacter = event.key.length === 1;
  const isShortcut = event.metaKey || event.ctrlKey || event.altKey;
  const isPressingAButton = focusIsOnButton && event.key === " ";
  return isCharacter && !isShortcut && !isPressingAButton;
}
