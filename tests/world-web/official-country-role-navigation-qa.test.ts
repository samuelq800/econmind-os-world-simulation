import { describe, expect, it } from 'vitest';
import { navigationCases } from '../../scripts/country-role-navigation-qa.mjs';

const fixture = () => ({
  matrix: [
    {
      country: '01',
      role: 'finance',
      viewports: [
        {
          viewport: 'desktop',
          technicalStatus: 'BLOCKED',
          gaps: ['IN_APP_ATLAS_RETURN_MISSING'],
        },
        { viewport: 'mobile', technicalStatus: 'PASS', gaps: [] },
      ],
    },
    {
      country: '70',
      role: 'trade',
      viewports: [
        {
          viewport: 'mobile',
          technicalStatus: 'FAIL',
          gaps: ['IN_APP_ATLAS_RETURN_MISSING', 'OTHER_GAP'],
        },
      ],
    },
  ],
});

describe('navigation-only source case selection, not browser acceptance', () => {
  it('selects only previously affected exact country/role/viewport tuples without changing old statuses', () => {
    const source = fixture(),
      before = JSON.stringify(source);
    expect(
      navigationCases(source).map(
        (row) => `${row.country}:${row.role}:${row.viewport}`,
      ),
    ).toEqual(['01:finance:desktop', '70:trade:mobile']);
    expect(JSON.stringify(source)).toBe(before);
    expect(navigationCases(source)[1]?.originalTechnicalStatus).toBe('FAIL');
  });
  it('rejects duplicate or invalid identity tuples', () => {
    const duplicate = fixture();
    duplicate.matrix.push(duplicate.matrix[0]!);
    expect(() => navigationCases(duplicate)).toThrow('CASE_DUPLICATE');
    const invalid = fixture();
    invalid.matrix[0]!.country = '99';
    expect(() => navigationCases(invalid)).toThrow('CASE_INVALID');
  });
  it('does not manufacture cases when no original view had the atlas gap', () => {
    const source = fixture();
    for (const cell of source.matrix)
      for (const view of cell.viewports) view.gaps = [];
    expect(navigationCases(source)).toEqual([]);
  });
});
