# MySQL 8.4 SQL 覆盖核查

检查日期：2026-09-30。基线：[MySQL 8.4 Reference Manual / SQL Statements](https://dev.mysql.com/doc/refman/8.4/en/sql-statements.html)，不升级到 Innovation，也不执行实库。

## 可复核清单

- [官方目录快照](official-topic-index.json)：Chapter 15 导航中的全部 248 个主题，包含语句、子句、概念页和已移除语法
- [逐主题映射](statement-coverage.json)：143 `structured`、62 `partial`、42 `context`、1 `excluded`，每项有官方 URL、抓取源 hash、文件映射和证据
- [逐文件审计](file-coverage.json)：136 个 SNF 文件全部核查；106 个显式规范语法骨架，30 个保留明确 partial 边界。56 个现有 SNF 文件本轮修改，文件数没有为统计而增加
- [输入与上下文契约](input-contracts.md)：类型/表达式、跨语句绑定、存储程序、引擎、认证、复制和运行状态限制
- [验证报告](validation-report.md) 与 [逐文件 parser 审计](validation-audit.json)

**主题数、文件数和独立 SQL 语句数不等价。** SHOW 的许多官方主题映射一个文件的不同 CASE；一个文件可有多个语句形态。`structured` 表示该主题的规范语法骨架已显式表达，不是“所有组合均合法”或“SQL 已执行通过”。`partial` 明确保留结构、表达式或外部绑定边界；`context` 是规则/概念/示例等非独立入口；`excluded` 是 8.4 明确移除的 SHOW MASTER STATUS。

## 主要修正

### 查询与 DDL

- CREATE VIEW 改为 AS query 后再 CHECK OPTION；SELECT 的 ROLLUP 分支补齐 GROUP BY
- 将不受支持的通用/LATERAL 表函数占位符替换为递归 JSON_TABLE 列、路径、NESTED、ON EMPTY/ON ERROR 结构
- 单表 UPDATE 不再借用任意 JOIN 表源，同时保留多表分支；扩展查询表达式括号/集合运算嵌套和 INTO 导出结构
- VALUES/INSERT/REPLACE 行、WINDOW 定义、多表 DELETE 目标和 ALTER USER 账户列表以完整 helper 为重复单元，不只重复末尾 token；补默认空行插入/替换
- 修正 generated column 顺序，补 temporal ON UPDATE / SRID；展开 ALTER TABLE 分区与 subpartition、HASH/KEY 增加分区、ALGORITHM/LOCK 结构
- PARTITION BY KEY 可以推断列，但 SUBPARTITION BY KEY 必须明确列；引擎/分区方法与在线 DDL 限制仍是语义条件

### 账号、存储程序与管理

- 纠正 SET PASSWORD 的 TO RANDOM；扩展 ALTER USER 注册、DEFAULT ROLE、独立 DISCARD OLD PASSWORD、认证因子及非空 TLS/资源组合
- 展开 GRANT/REVOKE 的静态权限和允许列清单的权限，动态权限仍由运行实例/插件绑定
- 删除 BEGIN 的非 MySQL NOT ATOMIC，允许空块，补每段内层语句的最终分号并分离 DECLARE 顺序；补 FETCH NEXT FROM
- LOCK TABLES 要求每个对象恰好一个 READ/WRITE 模式，并重复整个锁定对象
- CHANGE REPLICATION SOURCE/FILTER 支持真实逗号设置列表和清空过滤/忽略 ID；限定表名、字符串模式及数据库重写对按完整 helper 重复
- SET 支持异构变量赋值、DEFAULT 与作用域；补 EXPLAIN JSON INTO / FOR SCHEMA / 合法 ANALYZE 类别
- SHOW 补 EXTENDED COLUMNS、CREATE DATABASE IF NOT EXISTS、RELAYLOG channel 和依赖 FOR 的 USING；FLUSH/RESET 支持非表/控制操作列表

## 明确保留的边界

完整表达式/数据类型文法、跨文件 STATEMENT 类别绑定、prepared SQL 文本和消费方 SQL 生成尚未实现为闭合验证系统。存储程序作用域、标签和权限；账户认证插件与因子；查询/窗口/分区基数；引擎、复制、XA 与在线 DDL 状态仍需语义层验证。具体到 InnoDB，COALESCE/REORGANIZE PARTITION 不能因此推断支持 LOCK=NONE。

为规范输出省略某些等价排列和 ODBC `{ OJ ... }` 转义，不视作独立缺失语句。DELAYED 仅保留手册中接受但忽略的拼写，不承诺旧版本延迟执行行为。

本轮没有连接或启动 MySQL，没有执行任何 SQL，没有自动 CI、合并或部署。
