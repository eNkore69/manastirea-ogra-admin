const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

export async function hasValidWebpSignature(blob: Blob): Promise<boolean> {
  if (blob.size < 12) return false;

  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  return RIFF.every((byte, index) => header[index] === byte) &&
    WEBP.every((byte, index) => header[index + 8] === byte);
}
