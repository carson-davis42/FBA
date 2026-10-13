import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDataArg, parseFileArg } from './dataArg';

const FALLBACK = path.resolve('real-data');

describe('parseDataArg', () => {
  it('reads --data dir', () => {
    expect(parseDataArg(['--logos', '--data', 'scratch'], FALLBACK)).toEqual({ dir: path.resolve('scratch') });
  });
  it('reads --data=dir', () => {
    expect(parseDataArg(['--logos', '--data=scratch'], FALLBACK)).toEqual({ dir: path.resolve('scratch') });
  });
  it('errors on --data with no value', () => {
    expect(parseDataArg(['--logos', '--data'], FALLBACK)).toHaveProperty('error');
  });
  it('errors on --data followed by another flag', () => {
    expect(parseDataArg(['--data', '--force'], FALLBACK)).toHaveProperty('error');
  });
  it('errors on --data= with an empty value', () => {
    expect(parseDataArg(['--data='], FALLBACK)).toHaveProperty('error');
  });
  it('falls back without the flag', () => {
    expect(parseDataArg(['--logos'], FALLBACK)).toEqual({ dir: FALLBACK });
  });
});

describe('parseFileArg', () => {
  it('reads --file and --file=, resolved, and null when absent', () => {
    expect(parseFileArg(['--drafts'])).toEqual({ file: null });
    expect(parseFileArg(['--drafts', '--file', 'draft.xlsx'])).toEqual({ file: path.resolve('draft.xlsx') });
    expect(parseFileArg(['--file=a/b.xlsx'])).toEqual({ file: path.resolve('a/b.xlsx') });
  });
  it('is an error when the flag has no value', () => {
    expect('error' in parseFileArg(['--file'])).toBe(true);
    expect('error' in parseFileArg(['--file', '--data', 'x'])).toBe(true);
    expect('error' in parseFileArg(['--file='])).toBe(true);
  });
});
