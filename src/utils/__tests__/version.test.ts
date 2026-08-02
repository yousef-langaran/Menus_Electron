import { describe, it, expect } from 'vitest';
import { compareVersions, isVersionOutdated } from '../version';

describe('compareVersions', () => {
  it('reports equality for identical versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
  });

  it('compares numerically rather than lexicographically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
  });

  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBeLessThan(0);
  });

  it('tolerates surrounding whitespace', () => {
    expect(compareVersions(' 1.2.3 ', '1.2.3')).toBe(0);
  });

  it('treats unparsable segments as zero instead of producing NaN', () => {
    expect(compareVersions('1.x.3', '1.0.3')).toBe(0);
    expect(compareVersions('', '0.0.0')).toBe(0);
  });
});

describe('isVersionOutdated', () => {
  it('considers a missing current version outdated — the client must update', () => {
    expect(isVersionOutdated('', '1.0.0')).toBe(true);
  });

  it('considers any version acceptable when no minimum is enforced', () => {
    expect(isVersionOutdated('0.0.1', '')).toBe(false);
  });

  it('flags a version below the minimum', () => {
    expect(isVersionOutdated('1.0.0', '1.1.0')).toBe(true);
  });

  it('accepts a version exactly at the minimum', () => {
    expect(isVersionOutdated('1.1.0', '1.1.0')).toBe(false);
  });

  it('accepts a version above the minimum', () => {
    expect(isVersionOutdated('2.0.0', '1.1.0')).toBe(false);
  });

  it('does not flag 1.10.0 against a 1.9.0 minimum', () => {
    expect(isVersionOutdated('1.10.0', '1.9.0')).toBe(false);
  });
});
