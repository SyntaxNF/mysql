# MYSQL SNF

`MySQL 8.4 LTS` SQL 语句的 `SNF` 定义。

## 版本基线

本仓库以 [MySQL 8.4 Reference Manual](https://dev.mysql.com/doc/refman/8.4/en/sql-statements.html) 的 SQL Statement Syntax 为唯一语法基线，不混入 MySQL 5.7、8.0 或 Innovation Release 的兼容写法。

## 目录

- `create/`：创建数据库对象。
- `alter/`：修改数据库对象。
- `drop/`：删除数据库对象。
- `query/`：DML 与查询语句。
- `transaction/`：事务与锁定语句。
- `auth/`：账户、角色和授权语句。
- `compound/`：存储程序复合语句。
- `replication/`：复制与二进制日志控制语句。
- `other/`：预处理、维护、管理和实用语句。

## 定义规则

- `# CASE name`：完整语法的顶层分支。同一文件有多个顶层语法时，每个分支都需要标记。
- `# WHERE name`：单个可复用语法定义；可以使用逗号同时定义多个名称。
- `# ONEOFIS name`：每个物理行是一个候选分支，语义等同于 `{ a | b }`。
- `# PARTOFIS name`：每个空行分隔的 block 是一个候选分支，适用于需要跨多行的候选。
- `# STATEMENT name`：可嵌套 statement 的类型说明，不作为当前文件的顶层语法。

主语句的独立 clause 使用四个空格缩进并按行展示。`ONEOFIS` 的单个候选不能换行；需要换行时改用 `PARTOFIS`。

`alter/` 语句应优先把 `RENAME`、`ADD`、`DROP`、`SET` 等主操作提升为顶层 `# CASE`，使生成过程先确定修改内容。只有同一类且允许组合的属性才归入 `# CASE OPTIONS`；细节结构再使用 `WHERE`、`ONEOFIS` 或 `PARTOFIS`。

SNF 用于生成规范 SQL，而不是照搬服务端解析器能够容忍的全部写法。相互独立且至多出现一次的 clause 应按固定顺序分别定义为可选项，不得合并成可重复的 `ONEOFIS`。只有值列表、对象列表、语句序列等真正允许重复的结构才使用 `...`。

生成 SQL 时会统一移除圆括号 `()` 内最后一个逗号。因此，圆括号内相互独立的可选字段可以各自保留尾逗号，以固定顺序直接表达，无需使用 `PARTOFIS` 穷举字段组合。

每个 `.snf` 文件首行链接到对应的 MySQL 8.4 官方语法页。关键字使用大写，语法占位符使用小写。

通用语义的占位符命名与同级 PostgreSQL SNF 保持一致。当前文件的主对象使用 `name`，主对象的重命名目标使用 `new_name`；文件内的其他对象必须使用类型名，例如 `constraint`、`index`、`new_index`、`colname`。查询结构使用 `query_statement`、`col_expression`、`from_expression`、`order_by_expression` 等上下文明确的名称。MySQL 专属概念继续使用对应的领域名称，不为形式一致而改成通用占位符。
