# 当前代码收尾与外部接入交接 — 2026-10-08

Owner 最新指令：完成眼下代码构造，验证并正常合并，然后等待权威开局数据和外部 Worker。
本轮不再扩展新功能，不启动正式经济引擎，不替换冻结来源，不修改旧站产品。

## 已合并的固定起点

PR120 已合并为 `4532c20b62176de181bafe7df88f98091205087b`，对应三个 provider checks 与
Pages `37777894945` SUCCESS。C 实际正式域名脚本 GET 与 main 字节一致；
country01 六职位窄检、五次角色切换、普通 scroll 和 atlas 已观察通过。
该检查不是 420 视图、失败加载或经济运行验收；加载时短暂旧 tab title 的小问题保留。

PR121 已合并为 `f4384167cc26aec693f9e40c7ed5caf30da06f43`，tree
`adbf4d2c29f06cbd91c4e3c4b57d85cdcdb95dc5` 与固定候选 `7502eca` 相同。
trusted runtime `37779511289`、atlas `37779511298`、main Pages `37779992133`
均 SUCCESS。该增量接通真实 TEST_ONLY 正向入队与既有唯一 consumer；
历史 FINALIZED acknowledgement 不是经济 COMMITTED receipt。

## 当前三个收尾包

| 包                 | 固定来源与实际检查                                                                                                    | 当前边界                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Schema / lifecycle | PR118旧7bc960a source组合已获B批准，旧native4PASS；A新fixture fixed c0549e13b6424c828f05007db0c5f57342247421，100PASS | 旧full37780566377 FAIL保留；新fixture独审与最终组合CI仍需完成，未merge             |
| 正式结果 drawer    | D `15d5b8e` 加修复 `3354c29d2f9d039cd8d491dc8ede48325fb09753`；Root 正常 replay `c5c59cc` / `ef762d1`                 | F 修复独审 APPROVED；PR122 已正常合并 c205a36，两个 CI 与 Pages 通过；原 FAIL 保留 |
| Office HTTP route  | G固定98373e，E独审APPROVED；Root replay9c32aed及CI fixed d77d1f9                                                      | PR123正常合并96217db，treef605d1a与候选相同；两CI通过，不默认启动或注册生产        |

Schema 新 native run `37780566375` 的实际执行 checkout
`7398e8c0aa0b295fcf97ad7ecfd2a8336a0399a5` 与候选 tree 相同；Root 下载 JSON 后核实
4 PASS /0 FAIL /0 SKIP，SHA256
`094e3a98dab153e3810e2e28e8131eb679670bac8230a352d2eba5c64501dd46`。
旧 `37772932185` 的未捕获 EINVAL 仍为 FAIL，不用新的 source approval 或窄检覆盖。

新 whole run `37780566377` 的实际结果为 **2866 PASS /3 FAIL /153 SKIP**、829.06s。
三个失败都是 `v10-1-country-office-read-flow` 的旧真实 PGlite fixture 没有 FINAL receipt，
仅有占位 hash 的 command/event；新 publisher 严格拒绝 `decision receipt must be an object`。
A已交付仅测试fixture的c0549e1：真实Core hash/FINAL receipt与Atomic repo，
原三个测试块字节相同，孤立event/错误receipt时间/错误hash拒绝且投影保留；100定向PASS。
B对固定新fixture窄审尚需完成；不能移除receipt/hash校验或跳过断言。该 run 的 raw artifact
upload 另因 provider CreateArtifact 超时失败；此处不声称已经下载不存在的 artifact。

F 对 D 修复的固定 delta 独审报告 SHA256：
`d744ad909a07fce951c71533818d179b73e6a0134a8bc3a186db299f831b628d`。
原三个 closed-drawer 反例原样重跑 PASS，新增十项合法 close/reopen/readback 等控制 PASS。
这是源码独审；随后 PR122 exact-head trusted37783441986 与 atlas37783441860 实际 SUCCESS，
正常合并为 c205a36e6ad526c53d02229315b0a9b5f7ee41f1，tree5731df1 与 bb6c17f 相同。
main Pages37784260654 实际 SUCCESS。静态发布不等于外部 host 已接通。

Root 对组合 drawer 实际运行 44 consumer +10 closed-drawer +4 CI prerequisite，
共 **58 PASS /3 files**。自有 Core/Worker/API builds、strict consumer types、focused lint、
正式 web build、301 source boundary check 和真实 authoritative UI provenance 均通过。
原公开 UI 原件未改变；输出 937,636,869 bytes，小于既有 1GB 预算。
既有大 bundle /早期 shared CSS 引用 build warning 保留，不扩张到新的性能改版。
这不是正式 host、生产授权结果或经济运行证据。

Root 对 G 的实际 main 组合仅新增 route39 +CI prerequisite5，**44 PASS /2 files**，
32.23s；自有 Core/Worker/API builds、route strict types、focused lint/format通过。
生产 route 与纯 path 的 source delta SHA256
`745abf7397ac1d9617645582fe5b65841265dcdeec7c534c5c587e46be374a6d`
与 G 固定原件一致；独审仍以 fixed98373e 为目标。CI 明确增加新实际请求测试和 strictconfig，
不增加部署、host 或任何启动动作。未将真实 loopback HTTP 检查表述为 TLS/生产运行。

G独审报告SHA256：`03ae0869e97dbea67bf022f9bc4e56911d454748b69079a256d669948b4a21e6`。
E实际9项route定向检查及2补充控制通过；未保存完整raw9项log的限制原样保留。
Root核实报告hash，PR123正常合并为96217db583db4c1bd6ef74714b2e0a5ef6b7ed6d，
treef605d1a与候选d77d1f9相同，适用两CI均SUCCESS；Pages37785798701在本次freeze时仍进行中。

Root最终schema源码组合已加入上述两份已合并main和A新fixture（replay93016f8），
正常merge842a15c/3618b75。唯一冲突是CI prerequisite两边独立测试块，均完整保留，
实际6项CI检查PASS；A fixture7 +此前CI5共12PASS，strictfixture/types及完整配置workspace
typecheck PASS。A三文件与fixedc0549e1逐字节相同，0023SQL与fixed7461原件相同。
最终适用provider与新native回执尚待自己的固定候选结果，不能套用旧native或窄检当全量通过。

## 合并后停在什么状态

所有当前候选只在各自独审和适用 CI 通过后正常合并；合并 SHA/tree、provider 和 Pages
回执分别追加。旧失败、NOT_RUN 与限定范围原样保留，不为了收尾改变 gate/admission 状态。

正式引擎保持 **NOT_ACTIVATED**。不执行生产 seed、指令、tick、Worker/Clock 启动；
不将只读官方来源或 TEST_ONLY quantities/身份当作权威开局。Gate B 的 PENDING 不改写。

等待材料仅包括真实外部条件，不重新审批已经采用的经济规则：

1. 完整权威开局载体及币种/单位/时间/来源/权利映射，尤其金融持仓、政治资本和实际 Social/Industry operating state；缺失不补0。
2. 受控读回的唯一 World/seed/admission lineage、真实 Owner registry及 lawful seats。
3. 唯一 publisher 对 exact0023 的注册/发布/读回及实际外部 API/Worker/Clock 目标、权限和生命周期证据。

上述输入或连接完成前，源码可以交付，但不能宣称世界正式运行。后续只在新材料到达后恢复接入施工。
