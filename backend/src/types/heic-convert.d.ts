declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  const heicConvert: (opts: HeicConvertOptions) => Promise<ArrayBuffer>;
  export default heicConvert;
}
