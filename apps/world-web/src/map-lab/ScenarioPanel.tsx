import scenario from './geographic-scenario.json';
import { artwork } from './display-layers.js';
const number = (value: number) =>
  value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
export function ScenarioPanel({ selected }: { selected: string }) {
  const country = scenario.countries.find((c) => c.countryId === selected);
  const regions = scenario.regions.filter((r) => r.countryId === selected);
  const deposits = scenario.deposits.filter((r) => r.countryId === selected);
  const facilities = scenario.facilities.filter(
    (r) => r.countryId === selected,
  );
  const links = scenario.freight.filter((r) => r.countryIds.includes(selected));
  const grid = scenario.power.find((r) => r.countryId === selected);
  const balance = scenario.balanceChecks.filter((b) =>
    regions.some((r) => r.id === b.regionId),
  );
  const kinds = [...new Set(scenario.deposits.map((d) => d.commodityId))];
  return (
    <section className="scenario-panel">
      <h2>地理推导与开局情景</h2>
      <p>
        自然条件由地图、气候与明确假设推导；人口和资产是受自然条件约束的情景估计。当前没有绑定正式开局，候选设施尚未投运。
      </p>
      <div className="scenario-metrics">
        <span>{scenario.regions.length} 个经济区域</span>
        <span>6 类地质资源</span>
        <span>{scenario.facilities.length} 个候选设施</span>
        <span>{scenario.freight.length} 条待勘测连接</span>
      </div>
      <details>
        <summary>矿产供应来源与目录</summary>
        <table>
          <thead>
            <tr>
              <th>商品</th>
              <th>候选矿床</th>
              <th>涉及国家</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => {
              const rows = scenario.deposits.filter((r) => r.commodityId === k);
              const name = artwork.resources.find(
                (r) => r.commodityId === k,
              )?.kind;
              return (
                <tr key={k}>
                  <td>
                    {artwork.resourceTypes.find((t) => t.id === name)?.name}
                  </td>
                  <td>{rows.length}</td>
                  <td>{new Set(rows.map((r) => r.countryId)).size}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p>
          粮食归入农业用地。煤、铝土矿、镍等背景内容不进入首季商品目录。点位数量不是储量。
        </p>
      </details>
      {country ? (
        <>
          <h3>{selected.slice(-2)} 号国家 · 推导摘要</h3>
          <div className="scenario-metrics">
            <span>情景人口 {number(country.population)} 人</span>
            <span>劳动力 {number(country.labourForce)} 人</span>
            <span>{regions.length} 个经济区域</span>
            <span>{facilities.length} 个候选设施</span>
          </div>
          <details open>
            <summary>土地、淡水与农业</summary>
            {regions.map((r) => (
              <article key={r.id} className="scenario-region">
                <h4>
                  {r.id.split('-').at(-1)} · {number(r.areaKm2)} km²
                </h4>
                <p>
                  {r.humanGeography.settlementType} · 情景人口{' '}
                  {number(r.initial.population)} 人 · 城镇比重{' '}
                  {Math.round(r.humanGeography.scenarioUrbanShare * 100)}% ·
                  密度 {number(r.initial.population / r.areaKm2)} 人/km²
                </p>
                <p>
                  高程估计 {number(r.natural.meanElevationM)} m · 年雨量{' '}
                  {number(r.natural.annualRainMm)} mm · 温度{' '}
                  {r.natural.temperatureC} °C
                </p>
                <p>
                  潜在耕地 {number(r.landUseKm2.croplandPotential)} km² · 森林{' '}
                  {number(r.landUseKm2.forest)} km² · 山地{' '}
                  {number(r.landUseKm2.mountain)} km² · 内陆水体{' '}
                  {number(r.landUseKm2.inlandWater)} km²
                </p>
                <p>
                  城工用地潜力 {number(r.landUseKm2.urbanIndustrialPotential)}{' '}
                  km² · 可转换土地 {number(r.landUseKm2.convertible)} km²
                </p>
                <p>
                  可分配补给 {number(r.natural.allocatableWaterM3Day)} m³/模拟日
                  · 枯水期 {number(r.natural.drySeasonWaterM3Day)} m³/模拟日
                </p>
                <p>
                  情景耕地 {number(r.initial.croplandHa)} ha · 年产潜力{' '}
                  {number(r.natural.grainPotentialTonnesYear)} 吨 · 流域{' '}
                  {r.basinId}
                </p>
                <p>
                  太阳辐照 {r.natural.solarKwhM2Day} kWh/m²/日 · 风速估计{' '}
                  {r.natural.windMps} m/s
                </p>
              </article>
            ))}
          </details>
          <details>
            <summary>矿床、储量层次与开发条件（{deposits.length} 处）</summary>
            {deposits.map((r) => (
              <article key={r.id} className="scenario-region">
                <h4>
                  {r.id} · {r.commodityId}
                </h4>
                <p>
                  单位：{r.unit} · 地质区 {r.provinceId}
                </p>
                <p>
                  初始总量 {number(r.initialGeological)} · 已采{' '}
                  {number(r.cumulativeExtracted)} · 地下剩余{' '}
                  {number(r.remainingGeological)}
                </p>
                <p>
                  已发现剩余 {number(r.discoveredRemaining)} ⊇ 可采{' '}
                  {number(r.recoverableRemaining)} ⊇ 已开发{' '}
                  {number(r.developedRemaining)}
                </p>
                <p>
                  深度估计 {r.depthM} m · 开采能力估计{' '}
                  {number(r.extractionCapacityPerDay)} {r.unit}/模拟日
                </p>
                <p>
                  需道路、电网、设备与采矿许可；总量敏感范围为基准的 0.25–4
                  倍，不能按点位直接当库存。
                </p>
              </article>
            ))}
          </details>
          <details>
            <summary>人口、社会与开局账目</summary>
            <p>
              情景就业 {number(country.scenarioEmployed)} 人；求职失业{' '}
              {number(country.scenarioUnemployed)} 人。
            </p>
            <p>
              粮食产出能力 {number(country.foodProductionTonnesDay)} 吨/日；需求{' '}
              {number(country.foodDemandTonnesDay)} 吨/日；开局可用粮食{' '}
              {number(country.foodAvailableStockTonnes)} 吨。
            </p>
            <p>
              财政现金 {number(country.treasuryCashGcu)} GCU；银行存款{' '}
              {number(country.bankDepositsGcu)} GCU，准备金{' '}
              {number(country.bankReservesGcu)} GCU，贷款{' '}
              {number(country.bankLoansGcu)} GCU，权益{' '}
              {number(country.bankEquityGcu)} GCU。
            </p>
            <p>
              历史债务、既有合同、技术许可采用空白开局假设，不由地形推断。经济体建议编号{' '}
              {country.economyIdProposal} 尚未绑定团队。
            </p>
          </details>
          <details>
            <summary>具名设施与运输接入</summary>
            <p>
              以下全部为候选能力，尚未建成投运；生产系数需要绑定
              Core。涉及本国的待勘测连接 {links.length} 条。
            </p>
            {facilities.map((f) => (
              <article key={f.id} className="scenario-region">
                <h4>
                  {f.id} · {f.name}
                </h4>
                <p>
                  {number(f.estimatedCapacity)} {f.capacityUnit} ·{' '}
                  {f.requiredWorkers} 人 · {number(f.requiredPowerMW)} MW ·{' '}
                  {number(f.requiredWaterM3Day)} m³/日
                </p>
                <p>
                  设备 {f.equipmentUnits} 单位 · 维护{' '}
                  {number(f.maintenanceGcuDay)} GCU/日 · 建设{' '}
                  {f.constructionSimDays} 模拟日
                </p>
              </article>
            ))}
            <p>
              电网独立于货运：情景需求 {number(grid?.scenarioDemandMW ?? 0)}{' '}
              MW，候选输送能力 {number(grid?.transferCapacityMW ?? 0)}{' '}
              MW；跨境电力连接尚未建设。
            </p>
            <table>
              <thead>
                <tr>
                  <th>接入</th>
                  <th>距离 km</th>
                  <th>吨/日</th>
                  <th>模拟日</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.fromId} → {l.toId}
                      {l.requiresPortOrFerry ? ' · 需港口/渡运' : ''}
                      {l.requiresTransitConsent ? ' · 需过境许可' : ''}
                    </td>
                    <td>{number(l.distanceKm)}</td>
                    <td>{number(l.capacityTonnesDay)}</td>
                    <td>{number(l.travelSimDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details>
            <summary>权利与发展路线</summary>
            <p>
              土地管辖、资源开发、设施经营、陆路过境、港口使用分别登记。重叠海域暂缓资源开发，通航安排单独处理；共享水源必须分配流域用水权。
            </p>
            <p>
              两条可比较路径：农业与集散设施建设；矿产开发与跨境技术合作。是否可行取决于水、人员、投入、许可和有效运输，均无永久国家加成。
            </p>
          </details>
        </>
      ) : (
        <p>
          选择国家，即可查看其土地、补给、矿床、人口情景、设施能力和运输距离。
        </p>
      )}
      <details open>
        <summary>最终平衡条件</summary>
        <p>
          自然禀赋与人文人口先固定，以下缺口用于最后配置库存、建设与贸易条件，不反向改写地质总量或平均化人口。
        </p>
        {country && (
          <p>
            本国经济区域：粮食缺口{' '}
            {balance.filter((b) => b.foodNetTonnesDay < 0).length} 处，住房缺口{' '}
            {number(balance.reduce((n, b) => n + b.housingGapUnits, 0))}{' '}
            套，生活与农业用水超出补给{' '}
            {
              balance.filter((b) => b.waterAfterHouseholdsAndFarmsM3Day < 0)
                .length
            }{' '}
            处。
          </p>
        )}
        <p>
          还需满足：岗位按技能匹配；候选电网建成后覆盖需求；货运容量能承接粮食与工业流量；维护与工资有持续资金来源。跨境电力不使用货运连接。
        </p>
        <table>
          <thead>
            <tr>
              <th>粮食能力情景</th>
              <th>供给 吨/日</th>
              <th>需求 吨/日</th>
            </tr>
          </thead>
          <tbody>
            {scenario.scenarios.map((r, i) => (
              <tr key={r.id}>
                <td>
                  {['常态能力', '气候推导枯水期', '蓄水与灌溉恢复方案'][i]}
                </td>
                <td>{number(r.supply)}</td>
                <td>{number(r.demand)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          这些是地理供需诊断，尚不是完整生产链或实际运输测试。恢复方案需要先完成设施、资金、人员与用水分配。
        </p>
      </details>
      <details>
        <summary>推导方法、假设与启用条件</summary>
        <p>
          地图宽 36,000
          km，面积按统一平面比例计算。东西边界可环绕，但运输须有明确跨缝连接。高程由已绘山脊与距海距离构造，非实测
          DEM；流域为邻近水系的经济区域归集，非已验证水文模型。
        </p>
        <p>
          补给＝面积 × 年降水 × 径流系数，预留 65%
          生态径流。农业取土地与供水两者较小值，再按气候适宜度估算单产。人口采用承载量与近岸接入条件的情景比例。矿藏由环境代理、地质区、勘探面积与丰度假设推导；地表图像无法确认地下矿床。
        </p>
        <p>
          手册依据：第 22–23、90、93–96、98
          页。手册提供目录与约束；此处的估计系数由本地图情景提出，不是手册规定。
        </p>
        <p>
          正式启用仍需：农业唯一产出模块与配方、设施系数和赛季校准、真实经济体绑定、跨境权利和可通行路线、完整正常/阻断/恢复测试。
        </p>
        <p>
          公开包只含公开候选场景；将来未发现矿藏的位置与数量必须存放服务端，不能仅用隐藏图标保护。
        </p>
      </details>
    </section>
  );
}
