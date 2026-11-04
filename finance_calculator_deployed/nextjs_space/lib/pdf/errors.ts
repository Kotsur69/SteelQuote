/** A PDF failure whose message is safe to show the user; details belong in the server log. */
export class PdfRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfRenderError';
  }
}
