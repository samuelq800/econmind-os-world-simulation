# 已采用的水务首日人员方案：来源与运行接线

状态：`IMPLEMENTED_UNVERIFIED`（本批定向检查通过不代替独立验收或生产发布）。

用户于 2026-11-13 确认先前披露的首日方案；已记录在
`docs/governance/owner-inputs/2026-11-13/INDUSTRY_WATER_STAFF_USER_ADOPTION.original.json`，
SHA-256 `fa2ee807b63d903722bc896a439d12a4dfa1502294a0f626cfd37bf0efe5f406`。
该决定不再是待确认项。它不是专业资格认证、已完成劳动、付款或供水证据。

实现复用本国、同 OP、同既有位置的 POWER 岗位及 E03 人口坐标，保留原技能、工资和资金来源。
`UTILITY_WATER_<原炼厂 ID>` 是独立服务工作场所的记账标识，不是新建的物理设施或新人口。
水务和电力人员的 position/pool/cohort/绝对序号不变；现有 Core 共享工时账本拒绝重叠和累计超过 480 分钟。
既有水务 Core 继续要求实际取水区间全程至少一人、独立水务工作、实际工资支付及原资金账户镜像。
未增加每立方米工时系数，也没有改变水量、配额或模拟泵耗。

运行接线：受控发布 → 独立 WATER 人员原件 → RUN/WORK 原件解码 → 同一人员账本 → 原岗位工资与资金 → 历史回读。
原有 GRANT 的来源指纹保持不变。DELIVER 动态权利、保护性用水和已付供电原件由同批单独集成，不从人员来源通过推断送水完成。

## 实际来源结果

离线检查复用封存 child seed，SHA-256
`835f9ec096746e3bc8f8cd1a7235fc7a2af0daee06d4ceeedff1fdff99d0262f`，
并核对原 `fn13c/pg/reference-db.json` 标记和所选物理来源校验和。
21 个实际炼厂国家全部可映射真实既有 POWER 人员，0 个映射拒绝，合计 483627 人。
49 国仅表示本范围无炼厂；不能推断其余工业模块不适用。
每份 canonical 人员原件最大 2247 bytes。
逐国人数、技能、人口范围、原件哈希见 `water-staff-source-coverage.json`。

这不是实时空闲人数：当前占用、可付余额、已完成 WORK、工资支付、供水与生产均没有由离线工具执行。
重复来源使用同一人员身份，不能把 483627 人重复算作额外劳动力。

## 可复用执行入口

先用固定工具链构建 Core、Worker，然后运行只读工具（输出目录必须不存在）：

```sh
bash /workspace/.cloud-setup/run-world.sh node tools/office-connection/postwar-water-staff-source-coverage.mjs \
  --marker /workspace/.cloud-setup/evidence/fn13c/pg/reference-db.json \
  --out /workspace/rehearsal-20261113/new-water-staff-source-coverage
```

来源登记使用既有 `registered-refinery21-source-preparation.mjs` 的受控隔离入口；除既有 opt-in 外，必须显式设置
`ECONMIND_REGISTERED_WATER_STAFF_PREPARATION=1`，并先安装本批 WATER source SQL。
缺函数会以 `WATER_STAFF_SOURCE_MIGRATION_NOT_INSTALLED` 失败，不调用旧接口替代。
默认旧来源准备和 H6 只恢复不新登记 WATER。
每次重跑先复读原件字节、SHA、sourceRef 和当前 head；相同原件复用，冲突或撤销拒绝。
该入口保留经济表前后哈希不变检查，不提交 RUN/WORK/付款或供水命令，不启动 Clock。

## 本单元定向检查

- Core、Worker 构建通过。
- 新人员来源/重叠/480 分钟测试及既有 POWER、水务执行：13 通过。
- 既有跨服务混合回放与 Industry 工作规则：11 通过。
- 受控来源工具 opt-in 协议：11 通过。
- 所属文件 lint、格式通过；全仓回归由总控独立记录。
- 21 国来源离线映射：21 通过、0 拒绝；未执行来源登记或经济命令。

新 SQL 的实际 PostgreSQL、隔离克隆登记、受限角色及重跑证据由迁移单元分别记录。
不能将这里的来源检查算作六办公室完成、21 国已生产或正式上线。
