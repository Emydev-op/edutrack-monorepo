/**
 * A bulk-upload file as the import API takes it: a filled .xlsx template as base64, a .csv as
 * its text.
 */
export async function readImportFile(file: File): Promise<string> {
  if (/\.xlsx$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  return file.text();
}
