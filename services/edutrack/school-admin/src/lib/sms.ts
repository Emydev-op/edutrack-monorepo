/**
 * SMS length as networks count it: GSM-7 text fits 160 characters per page (153 when split),
 * anything else (emoji, ₦, curly quotes) switches the whole message to 70/67.
 */
const GSM =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';

/** Characters and SMS pages for a text, as networks count them. */
export function smsLength(text: string) {
  let gsmLen = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM.includes(ch)) gsmLen += 1;
    else if (GSM_EXT.includes(ch)) gsmLen += 2;
    else unicode = true;
  }
  const length = unicode ? [...text].length : gsmLen;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const pages = length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi);
  return { length, pages, unicode, perPage: pages > 1 ? multi : single };
}

/** SMS can't carry ₦ cheaply, so amounts go out as "N40,000". */
export const smsSafe = (text: string) =>
  text.replace(/₦/g, 'N').replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
