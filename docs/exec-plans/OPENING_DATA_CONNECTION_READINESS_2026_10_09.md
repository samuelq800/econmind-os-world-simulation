# 开局包与数据接口接线 — 2026-10-09

Owner 当前请求：先准备随时接入开局包，该处理的数据接口接上。
本轮只完成现有接口的显式接线，不启动经济、不虚构开局或任职数据。

## 固定起点与实际依赖

- 实际 main：96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d，treef605d1a。
- PR118 source组合已获B独审，四项检查通过；完整check尚未通过，不能当作main。
- 完整check的取消原因已通过GitHub实际annotations定位：hosted runner未获得，
  macOS arm64容量不足、没有执行步骤。Root仅恢复该取消job一次，保留旧CANCELLED。
- 现有read、financial intake、Office command routes各自实现，不等于默认API已mount。
- 唯一生产schema publisher、真实开局包/admission、lawful seats和外部host仍是实际条件。

## 所有权与施工顺序

先由A定位existing opening bundle→Core bridge→seed/bootstrap/admission/readback；
G定位existing三route→显式服务host；C定位正式browser→统一真实session接线。
先核实最小缺口，再绑定精确文件实施；不再造已经存在的接口。
Root只负责固定组合、CI接线、检查结果与交接记录。独审另交未参与实现的窗口。

允许：在隔离本地/CI验证现有真实链、数据形状/hash/拒绝控制及transport/session清理。
不允许：新SQL/schema/旧站改动、生产任意写入、自动启动、默认READY、补零、
mock成功回调、替代Core权威链、测试签名作为正式任职或source authority。

## 交付门槛

1. 开局包入口：原字节及来源保留、完整性与版本定位；已有Core validator拒绝不完整输入。
2. 服务端接线：复用现有auth/current binding/SQL ports和精确path；失败不触发写入。
3. 浏览器接线：真实token/current-session与server-owned pins；无配置默认断开。
4. 生命周期：撤权、断连、换国家/职位、pagehide后清除私密状态，迟到请求不复活。
5. 固定SHA/typecheck/正常定向测试、独立窄审与适用CI完成后正常合并。

只在真实输入和外部连接到达、受控发布与读回完成后报告生产连通。
Gate B、admission、worldId、seed和启动状态不因本接线计划改变。
