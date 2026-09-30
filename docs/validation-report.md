# 本轮验证结果

日期：2026-09-30；基线 MySQL 8.4 LTS；修改前 commit `58be2e2d0a6ae0c855eb7bd2a035c588e76a2b67`。

## 已完成

- 固定官方 SNF parser `bcf2c3ac58b45e7d5391716393586b00b11e0c1a`；Node.js `v24.19.0`
- 全部 136 个 `.snf` 解析成功；601 个内容块；源码/物理行 round-trip 和 AST span 检查通过
- 170 个 CASE、95 个 WHERE、35 个 ONEOFIS、31 个 PARTOFIS、28 个 STATEMENT 指令的项目检查通过
- 官方 248-topic 集合与映射完整性、136 个文件映射、本地辅助引用可达性、重复结构检查通过
- 57 个回归测试全部通过：29 个校验器正反例/真实 loop walker 测试，28 个本轮语法结构回归
- `git diff --check` 通过
- 独立只读复查发现的 SUBPARTITION KEY 非空列限制、复制过滤完整成员重复、SRS/account 名称域、inventory 必需性等已修正并复验

逐文件 parser 结果包含 532 个文件-名称输入候选对、165 个不同输入名称。这是输入契约清单，不是“缺失 532 个定义”，也不是“所有输入已完成语义校验”。

## 准备/中间失败记录

第一次结构 smoke 在实现尚未稳定时发现 CREATE/ALTER TABLE 缺失方括号，以及旧存储程序 STATEMENT 使用小写类别；随后均已修正。没有隐瞒为首次即通过。新增实际 loop walker 审查后，将右括号、引号、带前缀/后缀成员的重复改为完整 helper，并加入回归。

npm 发出环境 `http-proxy` 配置警告，但命令退出成功；它不影响以上结果。parser 的构建信息和重现命令见 [validation.md](validation.md)。

## 未执行，也不宣称通过

- MySQL 实库解析/执行、权限和运行时状态验证
- 消费方跨文件绑定、SQL 渲染、应用集成或数据库正反例测试
- 完整 SQL 表达式/类型语法证明、所有合法排列穷尽和所有非法组合排除

源码语法骨架和项目结构检查不能替代这些层次。30 个 partial 文件仍保持 partial，没有因为 parser 通过改称完整覆盖。
