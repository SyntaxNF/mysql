# 生成模板验证

本轮针对已确认的成员绑定、关键词、标点、顺序和缺失语法进行修正，不将 SNF 扩展成完整的 SQL 语义校验器。

## 生成契约

- `LOOP` 是零次或多次；纯 `[ item [, ...] ]` 不增加空列表能力
- 包含关键字、括号或末尾分号的整个可选组仍然有意义
- 独立、单次的 clause 保持固定顺序；只有真正的列表/序列重复
- `CHANGE REPLICATION FILTER`、`CHANGE REPLICATION SOURCE TO`、非表 `FLUSH` 和 `RESET` 的列表来自各自官方语法，不代表普通单次 clause 可以任意重复
- 表达式、正文和复用查询是正常输入；调用方负责 SQL 上下文、权限、状态、非空要求等约束
- 生成器按仓库既有契约移除圆括号内的尾逗号；不假设括号外也会清理

## 显式运行

遵循 AGENTS.md，只有用户要求验证时才执行这些命令。需要 Node.js 20.19+ 或 22.12+、Git，以及官方 parser 的固定版本及其依赖：

```sh
git clone https://github.com/SyntaxNF/parser.git ../snf-parser
git -C ../snf-parser checkout --detach bcf2c3ac58b45e7d5391716393586b00b11e0c1a
(cd ../snf-parser && pnpm install --frozen-lockfile)
SNF_PARSER_ROOT=../snf-parser npm run validate
SNF_PARSER_ROOT=../snf-parser npm test
```

已存在的同版本 parser checkout 可以直接复用。脚本检查实际 HEAD、源码/依赖清单的工作区状态和磁盘内容对应的 Git 对象；检查实际 `tsx` 版本为锁文件中的 `4.23.5`，然后直接加载已验证的 `src/index.ts`。不接受任意 `SNF_PARSER_MODULE`，不依赖未核实或过期的 dist 产物，不需要重新构建 parser。

## 检查内容

- 发现并解析全部 `.snf` 文件，检查官方来源 URL、文件格式、原文往返、AST 来源区间、单行 ONEOFIS 候选及未绑定的 postfix LOOP
- 用 parser 自身的 `exchangeLoopNode` 绑定成员，再用小型测试 fixture 检查零、一、二次重复；预期成员与分隔符独立指定
- 检查完整行/ROW、选择项/窗口、删除目标、赋值、账户认证、引用前缀、引号、重命名、复制列表及锁成员
- 检查 VIEW/GROUP BY、内部末尾分号、FETCH、ALTER EVENT、分区修饰标点、生成列顺序、TLS、tablespace 顺序和管理语句新增能力

测试 fixture 仅实现这些用例所需的生成契约，**不是下游实际 SQL 生成器**。不会访问数据库；不证明所有生成组合都可由 MySQL 接受，也不证明全部合法 SQL 已覆盖。零次重复的通过只证明模板允许该数量，不能推导 SQL 在每个位置都接受空列表。下游尾逗号清理实现不在本仓库，本轮没有执行它。

## 本轮结果（2026-10-01）

在用户批准的范围内，使用上面的固定 parser 源码执行：

- `npm run validate`：136 个 SNF 文件全部通过
- `npm test`：236 项通过，其中 136 项是逐文件 parser/AST 检查，100 项是生成契约回归
- 将 12 项重点回归应用于干净旧基线时均失败（预期），用于确认它们能够检测本次修复的旧问题
- `git diff --check`：通过
- 对 46 个修改的 SNF 文件及验证脚本分别进行了独立静态复核
- 未执行 MySQL 服务端 SQL、类型检查或应用构建；此仓库没有需要本轮构建的应用

这些数字是本轮检查结果，不是 SQL 语句覆盖率。CI 状态以对应 PR 的实际检查为准。

## 明确保留的来源分歧

`CREATE UNDO TABLESPACE` 的既有 `AUTOEXTEND_SIZE` 和 `ENGINE_ATTRIBUTE` 槽位未在本轮删改，也未被证明可执行。仓库以 Reference Manual 为语法基线；[AUTOEXTEND 手册](https://dev.mysql.com/doc/refman/8.4/en/innodb-tablespace-autoextend-size.html) 明确提到 CREATE UNDO 的 AUTOEXTEND_SIZE，CREATE TABLESPACE 的合并摘要也展示 ENGINE_ATTRIBUTE。另一方面，[8.4 CREATE UNDO production](https://github.com/mysql/mysql-server/blob/8.4/sql/sql_yacc.yy#L3184-L3202) 使用仅接受 ENGINE 的 [undo options production](https://github.com/mysql/mysql-server/blob/8.4/sql/sql_yacc.yy#L5502-L5522)。没有实际服务器验证时保留这项来源分歧，不把静态通过解释为 SQL 接受性证明。

`ALTER UNDO` 必须紧跟 SET、RENAME 没有后置选项等清晰结构问题已经修正；见 [ALTER tablespace productions](https://github.com/mysql/mysql-server/blob/8.4/sql/sql_yacc.yy#L7756-L7802)。
