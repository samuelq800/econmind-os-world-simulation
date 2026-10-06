import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const base = 'apps/world-web/public/season1-immersive/';
const game = readFileSync(base + 'country-game.js', 'utf8');
const context = readFileSync(base + 'country-context.js', 'utf8');
const roles = [
  'captain',
  'finance',
  'central_bank',
  'industry',
  'trade',
  'social',
];
const drawerSource = game.slice(
  game.indexOf(' function drawer('),
  game.indexOf(' const sourceNote='),
);
const blockedSource = game.slice(
  game.indexOf(' function blockedModule('),
  game.indexOf(' commands.close=()=>'),
);
const dismissSource = game.slice(
  game.indexOf(" commands['country-dismiss']="),
  game.indexOf(" commands['country-sites']="),
);
const guardSource = context.slice(
  context.lastIndexOf('if(countryScope){openModule='),
);

function fixture(countryScope: string, role: string, available = true) {
  const classes = new Set(['country-map-home', 'country-bound']);
  const trigger = { isConnected: true, dataset: {}, focus: vi.fn() };
  const panel = {
    hidden: true,
    innerHTML: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    contains: () => false,
    querySelector: () => ({ focus: vi.fn() }),
  };
  const home = vi.fn(() => {
    classes.add('country-map-home');
    panel.hidden = true;
  });
  const authority = vi.fn(() => {
    throw Error('No authority allowed in module UI');
  });
  const toast = vi.fn();
  const sandbox = {
    countryScope,
    countryOffice: role,
    roles: Object.fromEntries(roles.map((key) => [key, { code: key }])),
    catalog: {
      modules: roles.map((key) => ({ id: key, role: key, title: key })),
    },
    commands: {} as Record<string, (...args: unknown[]) => void>,
    document: {
      activeElement: trigger,
      body: { classList: { remove: (key: string) => classes.delete(key) } },
      querySelector: () => panel,
    },
    mapHome: home,
    esc: (value: string) => value.replaceAll('<', '&lt;'),
    window: {
      CountryGame: undefined as unknown,
      EconI18n: { refresh: vi.fn() },
    },
    toast,
    sourceSession: { cancel: vi.fn() },
    submit: authority,
    fetch: authority,
    localStorage: { setItem: authority },
  };
  const api = runInNewContext(
    `let sourceRequest=0,drawerReturnFocus=null,drawerReturnSelector=null;
const sourceNote='Selected source';let openModule;
${drawerSource}\n${dismissSource}\n${blockedSource}
window.CountryGame=${available ? '{blockedModule,home:mapHome}' : 'undefined'};
${guardSource}
({openModule,commands,blockedModule})`,
    sandbox,
  ) as {
    openModule: (id: string) => void;
    commands: Record<
      string,
      (button?: { dataset: { module: string } }) => void
    >;
    blockedModule: (module: { title: string }) => void;
  };
  return { api, classes, panel, trigger, home, toast, authority };
}

describe('country module fail-closed visibility', () => {
  it.each(roles)(
    'keeps HOME and shows a returnable blocked panel for %s',
    (role) => {
      for (const country of ['01', '54', '70']) {
        for (const command of ['country-room', 'country-module']) {
          const f = fixture(country, role);
          f.api.commands[command]({ dataset: { module: role } });
          expect(f.classes.has('country-map-home')).toBe(true);
          expect(f.panel.hidden).toBe(false);
          expect(f.panel.innerHTML).toContain(
            'World 实时数据与命令接口尚未接通',
          );
          expect(f.panel.innerHTML).toContain('No World command was submitted');
          expect(f.panel.innerHTML).toContain('data-cmd="country-home"');
          f.api.commands['country-home']();
          expect(f.home).toHaveBeenCalledOnce();
          expect(f.panel.hidden).toBe(true);
          expect(f.authority).not.toHaveBeenCalled();
        }
      }
    },
  );

  it('keeps direct module navigation fail-closed and supports close with focus return', () => {
    const f = fixture('54', 'finance');
    f.api.openModule('finance');
    f.api.commands['country-dismiss']();
    expect(f.panel.hidden).toBe(true);
    expect(f.trigger.focus).toHaveBeenCalledOnce();
    expect(f.classes.has('country-map-home')).toBe(true);
    expect(f.authority).not.toHaveBeenCalled();
  });

  it('retains the foreign-seat and unknown-module denial', () => {
    const f = fixture('54', 'finance');
    f.api.openModule('industry');
    f.api.openModule('missing');
    expect(f.toast).toHaveBeenCalledTimes(2);
    expect(f.panel.hidden).toBe(true);
    expect(f.classes.has('country-map-home')).toBe(true);
    expect(f.authority).not.toHaveBeenCalled();
  });

  it('retains toast-only fail-closed fallback when CountryGame is unavailable', () => {
    const f = fixture('54', 'finance', false);
    f.api.commands['country-room']({ dataset: { module: 'finance' } });
    expect(f.toast).toHaveBeenCalledWith(
      'World 实时数据与命令接口尚未接通；不能使用本地样例结算。',
    );
    expect(f.classes.has('country-map-home')).toBe(true);
    expect(f.authority).not.toHaveBeenCalled();
  });

  it('exports the blocked panel without changing the disabled local Confirm boundary', () => {
    expect(game).toContain('window.CountryGame={home:mapHome,blockedModule,');
    expect(game).toContain(
      "root.querySelector('.national-confirm').disabled=true",
    );
    expect(game).toContain('Local allocation cannot execute a World Command.');
  });
});
