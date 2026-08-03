# MYSQL SNF

`MySQL 8.4 LTS` SQL 语句的 `SNF` 定义。

## 版本基线

本仓库以 [MySQL 8.4 Reference Manual](https://dev.mysql.com/doc/refman/8.4/en/sql-statements.html) 的 SQL Statement Syntax 为唯一语法基线，不混入 MySQL 5.7、8.0 或 Innovation Release 的兼容写法。

## 目录

- `create/`：创建数据库对象。
- `alert/`：修改数据库对象；目录名沿用 SimpleNF/PostgreSQL 的既有约定。
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

每个 `.snf` 文件首行链接到对应的 MySQL 8.4 官方语法页。关键字使用大写，语法占位符使用小写。
