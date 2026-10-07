// Derived bytes are served ONLY under /local-demo/. Source files stay unchanged.
export function demoSource(name, source) {
  if (name === 'game.js') {
    const key = "const KEY='econmind-immersive-game-v1'";
    if (!source.includes(key)) throw Error('DEMO_SOURCE_KEY_DRIFT');
    return source.replace(key, "const KEY='econmind-DEMO_LOCAL-v1'");
  }
  if (name === 'country-context.js') {
    const guard = 'if(countryScope){openModule=function(id)';
    const index = source.lastIndexOf(guard);
    if (index < 0 || !source.slice(index).includes('World 实时数据'))
      throw Error('DEMO_SOURCE_MODULE_GUARD_DRIFT');
    // Keep static reader validation. Omit only the production module guard in
    // this local copy, so the existing local form renderer can be exercised.
    return source.slice(0, index);
  }
  if (name === 'country-game.js') {
    const marker =
      '// A stable built module reuses the reviewed local controller';
    const index = source.indexOf(marker);
    if (index < 0) throw Error('DEMO_SOURCE_RUNTIME_DRIFT');
    return source.slice(0, index); // Never mount the trusted production runtime.
  }
  if (name === 'i18n.js')
    return source.replace(
      "key='econmind-ui-language'",
      "key='econmind-DEMO_LOCAL-language'",
    );
  return source;
}
