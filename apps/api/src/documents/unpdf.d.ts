declare module 'unpdf' {
  export function getDocumentProxy(data: Uint8Array): Promise<unknown>
  export function extractText(data: unknown, options: { mergePages: true }): Promise<{ text: string }>
}
