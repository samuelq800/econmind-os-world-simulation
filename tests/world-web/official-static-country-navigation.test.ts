import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const root = 'apps/world-web/public/season1-immersive/';
const game = readFileSync(root + 'country-game.js', 'utf8');
const atlas = readFileSync(root + 'countries/countries.js', 'utf8');
const roleNames = {
  captain: '国家队长',
  finance: '财政部长',
  central_bank: '央行行长',
  industry: '产业部长',
  trade: '贸易部长',
  social: '社会部长',
};
const gameNavigation = game.slice(
  game.indexOf(' function countryRoleViewHref('),
  game.indexOf(' const office='),
);
const atlasNavigation = atlas.slice(
  atlas.indexOf('function atlasReturnHref('),
  atlas.indexOf('function render()'),
);

class Node {
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  children: Node[] = [];
  handlers: Record<string, () => void> = {};
  textContent = '';
  innerHTML = '';
  value = '';
  selected = false;
  href = '';
  constructor(readonly tag = 'div') {}
  setAttribute = (key: string, value: string) => {
    this.attributes[key] = value;
  };
  append = (node: Node) => {
    this.children.push(node);
  };
  replaceChildren = (...nodes: Node[]) => {
    this.children = nodes;
  };
  addEventListener = (key: string, callback: () => void) => {
    this.handlers[key] = callback;
  };
  querySelector = () => this;
}

function navigation(number = '70', selectedRole = 'finance', query?: string) {
  const identity = new Node('strong');
  const header = new Node('header');
  const location = {
    href: `https://fixture.invalid/prefix/season1-immersive/?${query ?? `role=${selectedRole}&country=${number}`}#country`,
    assign: vi.fn(),
  };
  const authority = vi.fn();
  const context = {
    URL,
    config: roleNames,
    roleNames,
    roles: Object.fromEntries(
      Object.entries(roleNames).map(([key, name]) => [key, { name }]),
    ),
    countryScope: number,
    role: selectedRole,
    chosenRole: selectedRole,
    country: { number, name: number === '70' ? 'Rhea' : 'Avenor' },
    location,
    parent: new URL('https://fixture.invalid/prefix/season1-immersive/'),
    url: new URL(
      location.href.replace(
        '/season1-immersive/',
        '/season1-immersive/countries/',
      ),
    ),
    document: {
      createElement: (tag: string) => new Node(tag),
      querySelector: () => header,
    },
    localStorage: { setItem: authority },
    commands: { submit: authority },
    setRole: authority,
  };
  const api = runInNewContext(
    `${gameNavigation}\n${atlasNavigation}\n({countryRoleViewHref,mountCountryRoleSwitch,atlasReturnHref,mountAtlasReturn})`,
    context,
  ) as {
    countryRoleViewHref: (
      number: string,
      role: string,
      href: string,
    ) => string | null;
    atlasReturnHref: (number: string, role: string) => string | null;
    mountCountryRoleSwitch: (root: { querySelector: () => Node }) => void;
    mountAtlasReturn: () => void;
  };
  return { api, location, identity, header, authority };
}

describe('public static country navigation, not Office authorization', () => {
  it('preserves all 70 countries and six legal roles under a deployed path prefix', () => {
    for (let i = 1; i <= 70; i++) {
      const number = String(i).padStart(2, '0');
      for (const role of Object.keys(roleNames)) {
        const { api, location, authority } = navigation(number, role);
        const expected = `https://fixture.invalid/prefix/season1-immersive/?role=${role}&country=${number}#country`;
        expect(api.atlasReturnHref(number, role)).toBe(expected);
        expect(api.countryRoleViewHref(number, role, location.href)).toBe(
          expected,
        );
        expect(authority).not.toHaveBeenCalled();
      }
    }
  });

  it.each(['00', '71', '1', '070', '../70', '70&role=trade'])(
    'rejects invalid country %s',
    (country) => {
      const { api, location } = navigation();
      expect(api.atlasReturnHref(country, 'finance')).toBeNull();
      expect(
        api.countryRoleViewHref(country, 'finance', location.href),
      ).toBeNull();
    },
  );

  it.each([
    'admin',
    'constructor',
    '__proto__',
    'toString',
    'FINANCE',
    'finance&country=01',
  ])('rejects invalid role %s', (role) => {
    const { api, location } = navigation();
    expect(api.atlasReturnHref('70', role)).toBeNull();
    expect(api.countryRoleViewHref('70', role, location.href)).toBeNull();
  });

  it.each([
    'role=admin&country=70',
    'role=finance&role=trade&country=70',
    'role=finance&country=70&country=01',
    'role=finance&country=01',
  ])(
    'does not mount navigation for ambiguous or invalid incoming context %s',
    (query) => {
      const { api, identity, location } = navigation('70', 'finance', query);
      api.mountCountryRoleSwitch({ querySelector: () => identity });
      expect(identity.children).toHaveLength(0);
      expect(api.atlasReturnHref('70', 'finance')).toBeNull();
      expect(location.assign).not.toHaveBeenCalled();
    },
  );

  it.each(['01', '70'])(
    'mounts native accessible role selection for country%s, with no state write',
    (country) => {
      const { api, identity, location, authority } = navigation(country);
      api.mountCountryRoleSwitch({ querySelector: () => identity });
      const label = identity.children[0]!;
      const select = label.children[0]!;
      expect(label.tag).toBe('label');
      expect(label.textContent).toContain('Static view · No seat grant');
      expect(select.tag).toBe('select');
      expect(select.attributes['data-country-role-switch']).toBe('');
      expect(select.attributes['aria-label']).toContain(
        'no Office authorization',
      );
      expect(select.attributes.style).toContain('min-height:44px');
      expect(select.children.map((option) => option.value)).toEqual(
        Object.keys(roleNames),
      );
      expect(select.value).toBe('finance');
      select.value = 'trade';
      select.handlers.change!();
      expect(location.assign).toHaveBeenCalledWith(
        `https://fixture.invalid/prefix/season1-immersive/?role=trade&country=${country}#country`,
      );
      location.assign.mockClear();
      select.value = 'admin';
      select.handlers.change!();
      expect(location.assign).not.toHaveBeenCalled();
      expect(select.value).toBe('finance');
      expect(authority).not.toHaveBeenCalled();
    },
  );

  it('mounts an actual atlas a[href], not only browser back', () => {
    const { api, header, authority } = navigation();
    api.mountAtlasReturn();
    const link = header.children[0]!;
    expect(link.tag).toBe('a');
    expect(link.href).toBe(
      'https://fixture.invalid/prefix/season1-immersive/?role=finance&country=70#country',
    );
    expect(link.attributes['data-country-atlas-return']).toBe('');
    expect(link.textContent).toContain('Rhea');
    expect(link.textContent).toContain('Return to static view (no seat grant)');
    expect(authority).not.toHaveBeenCalled();
    expect(atlas).toContain('if(!Object.hasOwn(roleNames,chosenRole)');
    expect(game).toContain('mountCountryRoleSwitch(root);');
  });

  it.each([
    'role=admin&country=70',
    'role=constructor&country=70',
    'role=finance&role=trade&country=70',
    'role=finance&country=70&country=01',
  ])(
    'the full atlas controller refuses ambiguous role context before fetching: %s',
    async (query) => {
      const app = new Node();
      const fetch = vi.fn();
      runInNewContext(atlas, {
        URL,
        location: {
          href: `https://fixture.invalid/prefix/season1-immersive/countries/?${query}&view=atlas`,
        },
        document: {
          currentScript: {
            src: 'https://fixture.invalid/prefix/season1-immersive/countries/countries.js',
          },
          querySelector: () => app,
          addEventListener: vi.fn(),
          body: { dataset: {} },
        },
        window: { addEventListener: vi.fn() },
        fetch,
      });
      await Promise.resolve();
      expect(fetch).not.toHaveBeenCalled();
      expect(app.innerHTML).toContain('公开角色或国家视图参数无效');
      expect(app.innerHTML).not.toContain('data-country-atlas-return');
    },
  );
});
