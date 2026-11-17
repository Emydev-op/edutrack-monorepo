import { AppException } from '../../common/errors/app.exception.js';
import {
  branchLabel,
  defaultRole,
  formatNumber,
  groupOf,
  numberOf,
  parseCsv,
  parseUpload,
  toE164,
} from './staff-view.js';

const dataUrl = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString('base64')}`;

describe('staff rules', () => {
  it('groups non-teaching staff by job title, as the directory tabs do', () => {
    expect(groupOf('Teaching', 'Bursar')).toBe('Teaching');
    expect(groupOf('Non-teaching', 'Bursar')).toBe('Finance');
    expect(groupOf('Non-teaching', 'Accounts Officer')).toBe('Finance');
    expect(groupOf('Non-teaching', 'Driver')).toBe('Operations');
    expect(groupOf('Non-teaching', 'Secretary')).toBe('Administrative');
  });

  it('suggests a role from the position', () => {
    expect(defaultRole('Bursar', 'Non-teaching')).toBe('Bursar');
    expect(defaultRole('Mathematics Teacher', 'Teaching')).toBe('Teacher');
    expect(defaultRole('Driver', 'Non-teaching')).toBeNull();
  });

  it('labels branches, "All branches" when they cover every active one', () => {
    const branches = [
      { id: 'a', name: 'Main Campus', active: true },
      { id: 'b', name: 'Lekki Campus', active: true },
      { id: 'c', name: 'Ajah Annex', active: false },
    ];
    expect(branchLabel(['a', 'b'], branches)).toBe('All branches');
    expect(branchLabel(['a', 'c'], branches)).toBe('Main Campus + Ajah Annex');
    expect(branchLabel(['a'], [branches[0]!])).toBe('Main Campus');
  });

  it('formats staff numbers and reads them back', () => {
    expect(formatNumber('GFA-ST-[####]', 152, 2026)).toBe('GFA-ST-0152');
    expect(formatNumber('ST/[YY]/[###]', 7, 2026)).toBe('ST/26/007');
    expect(numberOf('GFA-ST-0117')).toBe(117);
    expect(numberOf('NONE')).toBe(0);
  });

  it('normalises Nigerian mobile numbers', () => {
    expect(toE164('0803 555 0161')).toBe('+2348035550161');
    expect(toE164('+234-803-555-0161')).toBe('+2348035550161');
    expect(toE164('12345')).toBeNull();
  });

  it('reads CSV with quotes, doubled quotes, CRLF and blank lines', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', '2'],
    ]);
  });

  it('checks uploads by their bytes and size, not their label', () => {
    const pdf = parseUpload(dataUrl('application/pdf', Buffer.from('%PDF-1.7')), 'document');
    expect(pdf).toMatchObject({ mime: 'application/pdf', ext: 'pdf' });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    // A PNG labelled as PDF is still a PNG.
    expect(parseUpload(dataUrl('application/pdf', png), 'document').mime).toBe('image/png');
    expect(() => parseUpload(dataUrl('image/png', Buffer.from('nope')), 'photo')).toThrow(
      AppException,
    );
    expect(() => parseUpload(dataUrl('application/pdf', Buffer.from('%PDF')), 'photo')).toThrow(
      'Use a JPG or PNG image.',
    );
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2 * 1024 * 1024)]);
    expect(() => parseUpload(dataUrl('image/jpeg', big), 'photo')).toThrow(
      'The photo is larger than 2 MB.',
    );
    expect(() => parseUpload('not a data url', 'document')).toThrow('Use a PDF, JPG or PNG file.');
  });
});
