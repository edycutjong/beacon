import { describe, expect, it } from 'vitest';
import { buildPairingLink, extractProviderKey } from '../pairingLink.ts';

const KEY = 'a'.repeat(64);
const MIXED = 'ABCDEF0123456789'.repeat(4); // 64 hex chars, mixed case

describe('extractProviderKey', () => {
  it('returns null for empty / nullish input', () => {
    expect(extractProviderKey(null)).toBeNull();
    expect(extractProviderKey(undefined)).toBeNull();
    expect(extractProviderKey('')).toBeNull();
    expect(extractProviderKey('   ')).toBeNull();
  });

  it('accepts a raw 64-char hex key', () => {
    expect(extractProviderKey(KEY)).toBe(KEY);
  });

  it('lowercases mixed-case hex keys', () => {
    expect(extractProviderKey(MIXED)).toBe(MIXED.toLowerCase());
  });

  it('extracts key from a beacon:// deeplink', () => {
    expect(extractProviderKey(`beacon://pair?key=${KEY}`)).toBe(KEY);
  });

  it('extracts key from an https URL form', () => {
    expect(extractProviderKey(`https://beacon.app/pair?key=${KEY}`)).toBe(KEY);
  });

  it('supports uplink= and provider= aliases', () => {
    expect(extractProviderKey(`beacon://pair?uplink=${KEY}`)).toBe(KEY);
    expect(extractProviderKey(`beacon://pair?provider=${KEY}`)).toBe(KEY);
  });

  it('handles extra query params around the key', () => {
    expect(extractProviderKey(`beacon://pair?topic=field&key=${KEY}&v=1`)).toBe(KEY);
  });

  it('rejects keys that are too short', () => {
    expect(extractProviderKey('abc123')).toBeNull();
    expect(extractProviderKey('a'.repeat(63))).toBeNull();
  });

  it('rejects non-hex strings', () => {
    expect(extractProviderKey('z'.repeat(64))).toBeNull();
  });

  it('round-trips with buildPairingLink', () => {
    expect(extractProviderKey(buildPairingLink(KEY))).toBe(KEY);
  });

  it('extracts embedded key from a noisy string with non-hex noise', () => {
    expect(extractProviderKey(`noise_${KEY}_noise`)).toBe(KEY);
  });
});

describe('buildPairingLink', () => {
  it('builds a beacon deeplink from a key', () => {
    expect(buildPairingLink(KEY)).toBe(`beacon://pair?key=${KEY}`);
  });
});
