/**
 * LinkedIn doesn't allow direct posting via personal API.
 * v1 strategy: copy content to clipboard + open LinkedIn share dialog.
 */

export async function copyAndOpenLinkedIn(content) {
  try {
    await navigator.clipboard.writeText(content);
  } catch (err) {
    console.error('Clipboard write failed', err);
  }

  // LinkedIn share intent — opens compose window pre-focused on share
  const shareUrl = 'https://www.linkedin.com/feed/?shareActive=true';
  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Outreach: copy the message, then open the lead's profile in a new tab.
 * LinkedIn has no URL parameter for pre-filling an invite note or InMail, so
 * Shannon pastes and sends from LinkedIn itself (Connect → Add a note, or Message).
 */
export async function copyAndOpenProfile(text, profileUrl) {
  // Start the clipboard write while this tab still has focus, then open the
  // profile without awaiting (Safari blocks window.open after an await).
  const copied = copyToClipboard(text);
  window.open(profileUrl, '_blank', 'noopener,noreferrer');
  try {
    await copied;
    return true;
  } catch (err) {
    console.error('Clipboard write failed', err);
    return false;
  }
}

export function copyToClipboard(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve();
}
