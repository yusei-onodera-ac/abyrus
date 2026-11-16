/** Copies text to the clipboard. Uses the async Clipboard API where the page
 *  is allowed to (https/localhost, after a tap), else the old selection trick. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement('textarea');
    box.value = text;
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    box.remove();
    return ok;
  }
}

/** Opens the device's share sheet where there is one. 'unavailable' means the
 *  caller should fall back to copying. */
export async function shareLinkNatively(title: string, text: string, url: string): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (typeof navigator.share !== 'function') return 'unavailable';
  try {
    await navigator.share({ title, text, url });
    return 'shared';
  } catch {
    // Dismissing the sheet rejects; that isn't an error worth surfacing.
    return 'cancelled';
  }
}
