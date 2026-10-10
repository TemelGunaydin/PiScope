// Shared by the browser's exact approval, collector and installed Pi adapter.
// Metadata, not an authorization token; the draft itself is never rewritten.
export function noteRequestHeader(id) {
  return `PiScope note request. Request ID: ${id}\n\n`;
}
export function noteRequestPrompt(id, draft) {
  return noteRequestHeader(id) + draft;
}
export function isNoteRequestPrompt(id, prompt) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_.:\-]{1,160}$/.test(id) || typeof prompt !== 'string') return false;
  const header = noteRequestHeader(id);
  return prompt.startsWith(header) && Boolean(prompt.slice(header.length).trim());
}
